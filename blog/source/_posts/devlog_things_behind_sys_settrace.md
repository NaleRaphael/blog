---
title: "Things behind `sys.settrace()`"
date: 2020-03-12 11:20:08
tags:
- devlog
- python
---

As I was digging into CPython's internals in order to implement a new feature of a virtual machine made recently, I guess that I probably solved a [TODO task listed in the source code of `byterun`][byterun_todo_call_traceback] to a certain degree.

This story begins with an interesting idea of using `pdb` in `bytefall` virtual machine...

(To avoid confusion and being affected by the changes among versions, here we take CPython 3.7 as the runtime)


## When you call `pdb.set_trace()`
Typically, you need the following line to enter the debugging mode provided by `pdb`:
```python
import pdb; pdb.set_trace()
```

Once that line is executed, you are able to use all commands provide by `pdb` or have a good time with REPL inside the interactive mode. However, in prior versions of `bytefall`, internal execution flow of `bytefall` virtual machine will be revealed when debugging mode is activated.

It's such a tsunami for users who just want to check how their code work. Because they will not only be overwhelmed by too much information, but also get stucked in those frames with data related to their code indirectly.

So, our goal is to make user able to use `pdb` like the way they are using in a normal Python runtime. To achieve this goal, we have to understand how `pdb.set_trace()` work first. But before diving into source code, we need to figure out what we are interesting in, and it will help us focus on the problem we want to solve.

<a name='goal_of_tracing_pdb_source'></a>

As we want to control the information exposure of internal execution, what we need to trace are most likely some operations related to `frame`. Because `frame` contains information of executing scope, and it also related to the call stack which we can get from `traceback`.

It sounds like a reasonable guess, so let's start to take a quick look at the implementation of `pdb`.

1. Starting from the call `pdb.set_trace()`, we can speculate that `set_trace` is a function defined in the module scope of `pdb`. And here is what we got in `pdb.py`:
    ```python
    # @pdb.py::set_trace
    def set_trace(*, header=None):
        pdb = Pdb()
        if header is not None:
            # Print `header` to stdout
            pdb.message(header)

        # The code we want to know
        pdb.set_trace(sys._getframe().f_back)
    ```

    In those lines above, we know that there is an instance of `Pdb` class being instantiated and its method `set_trace()` is called.
    Also, `set_trace()` is the only operation related to frame here, so that it's what we are interesting in. However, we cannot find `set_trace()` in `Pdb` class, so it's probably defined in its parent `bdb.Bdb`.

2. After navigating to the file `bdb.py`, we found it indeed:
    ```python
    # @bdb.py::class Bdb::set_trace
    def set_trace(self, frame=None):
        """Start debugging from frame.

        If frame is not specified, debugging starts from caller's frame.
        """
        if frame is None:
            frame = sys._getframe().f_back
        self.reset()

        # Install callback `trace_dispatch` to each frame, and set `botframe` up
        while frame:
            frame.f_trace = self.trace_dispatch
            self.botframe = frame
            frame = frame.f_back

        # Set information for `step` command
        self.set_step()

        # The code we want to know
        sys.settrace(self.trace_dispatch)
    ```

    According to the documentation of [inspect][doc_inspect_frame] and [sys][doc_sys_settrace], we can know that `f_trace` is used to store a callback function for tracing code, and that callback function will be installed through `sys.settrace()`.

    And what will the callback function `trace_dispatch()` do?
    ```python
    def trace_dispatch(self, frame, event, arg):
        # Details about this callback function is also documented in its
        # docstring.
        if self.quitting:
            return # None
        if event == 'line':
            return self.dispatch_line(frame)
        if event == 'call':
            return self.dispatch_call(frame, arg)
        if event == 'return':
            return self.dispatch_return(frame, arg)
        if event == 'exception':
            return self.dispatch_exception(frame, arg)
        if event == 'c_call':
            return self.trace_dispatch
        if event == 'c_exception':
            return self.trace_dispatch
        if event == 'c_return':
            return self.trace_dispatch
        print('bdb.Bdb.dispatch: unknown debugging event:', repr(event))
        return self.trace_dispatch
    ```

    It works like the way how it's described in document. When it's invoked with argument `event` of `'line', 'call', 'return', 'exception'`, it will call those functions corresponding to each event. But it's irrelevant to the control of frame stack. In other word, it's like a subscriber who is responsible to do something according to given `frame`, not an issuer which is able to determine when to fire an event with specific `frame`. Therefore, it seems `trace_dispatch()` is not a function able to control the information exposure of internal execution.

    But it's fine, let's keep tracing deeper into `sys.settrace()`.

3. Since `sys` module is not written in Python, we have to access it from CPython source code. And here is how `sys.settrace()` looks like:
    ```cpp
    // @cpython/Python/sysmodule.c::sys_settrace
    // signature in Python:
    //   `settrace(function)`
    static PyObject *
    sys_settrace(PyObject *self, PyObject *args) {
        /* omitted code */

        if (args == Py_None)
            PyEval_SetTrace(NULL, NULL);
        else
            // args: your Python callback function
            PyEval_SetTrace(trace_trampoline, args);

        /* omitted code */
    }
    ```

    According to the signature of `sys.settrace()`, we can know that `args` is the callback function passed from Python side. And once `args` is not `None`, `PyEval_SetTrace()` will be called with a function named `trace_trampoline()` and the callback function we just passed in.

    Next, let's see how `trace_trampoline()` is implemented.
    ```cpp
    // @cpython/Python/sysmodule.c::trace_trampoline
    static int
    trace_trampoline(PyObject *self, PyFrameObject *frame,
                     int what, PyObject *arg) {
        /* omitted code */

        // Determine the callback function
        if (what == PyTrace_CALL)
            callback = self;
        else
            callback = frame->f_trace;

        /* omitted code */

        result = call_trampoline(callback, frame, what, arg);

        /* omitted code */
    }

    // @cpython/Python/sysmodule.c::call_trampoline
    static PyObject *
    call_trampoline(PyObject* callback,
                    PyFrameObject *frame, int what, PyObject *arg) {
        /* omitted code */
        stack[0] = (PyObject *)frame;
        stack[1] = whatstrings[what];
        stack[2] = (arg != NULL) ? arg : Py_None;

        /* call the Python-level function */
        result = _PyObject_FastCall(callback, stack, 3);

        /* omitted code */
    }
    ```

    Remember what the signature of `trace_dispatch()` looks like? The last 3 arguments are the same as those in signatures of `trace_trampoline()` and `call_trampoline()`.
    So, based on these implementation and function signatures, we can speculate that `trace_trampoline()` would play a role of invoking callback function while it is triggered.

    But still, these 2 C-functions are not used to control frame stack. There is one remaining function for us to keep investigate: `PyEval_SetTrace()`.

4. Prefix of `PyEval_SetTrace()` indicating that this function is related to the bytecode dispatching loop locating in `ceval.c`, and here is a sketch of it:
    ```cpp
    // @cpython/Python/ceval.c::PyEval_SetTrace
    void
    PyEval_SetTrace(Py_tracefunc func, PyObject *arg)
    {
        PyThreadState *tstate = PyThreadState_GET();

        /* omitted code */

        tstate->c_tracefunc = func;
        tstate->c_traceobj = arg;

        /* omitted code */
    }
    ```

    We can see that there are 2 attributes of `tstate` is set, and they are also the input arguments of this function. To make it clear, let's recall the call stack starting from `sys.settrace()` in Python with a custom callback function named in `py_callback`:
    ```raw
    # --- In Python ---
    sys.settrace(py_callback)

    # --- In aspect of C ---
    # ->
    # signature: `sys_settrace(PyObject *self, PyObject *args)`
    sys_settrace(..., py_callback)
    
    # ->
    # signature: `PyEval_SetTrace(Py_tracefunc func, PyObject *arg)`
    PyEval_SetTrace(trace_trampoline, py_callback)
    ```

    Therefore, we can know that `func` and `arg` are actually:
    ```cpp
    // in PyEval_SetTrace()
    tstate->c_tracefunc = func;     // trace_trampoline
    tstate->c_traceobj = arg;       // py_callback
    ```

    And we can be sure that `pdb.set_trace()` is just an operation of setting up things for tracing code, instead of an operation related to the control of frame stack. But since we got some clues about `tstate->c_tracefunc` and `tstate->c_traceobj`, we can still go further into the huge loop inside `_PyEval_EvalFrameDefault()`.


## Take a look at the huge evaluation loop
Before analyzing `_PyEval_EvalFrameDefault()`, we can find out those functions which take either `tstate->c_tracefunc` or `tstate->c_traceobj` as its arguments. This could make us focus on those parts which we are interested in.

And here are the signatures of those functions we found:
```cpp
// @cpython/Python/ceval.c
static int
call_trace_protected(Py_tracefunc func, PyObject *obj,
                     PyThreadState *tstate, PyFrameObject *frame,
                     int what, PyObject *arg)

static int
call_trace(Py_tracefunc func, PyObject *obj,
           PyThreadState *tstate, PyFrameObject *frame,
           int what, PyObject *arg)

static int
maybe_call_line_trace(Py_tracefunc func, PyObject *obj,
                      PyThreadState *tstate, PyFrameObject *frame,
                      int *instr_lb, int *instr_ub, int *instr_prev)

static void
call_exc_trace(Py_tracefunc func, PyObject *self,
               PyThreadState *tstate, PyFrameObject *f)
```

Bases on this, we can simplify the implementation of `_PyEval_EvalFrameDefault()` to the following one:
```cpp
// @cpython/Python/ceval.c::_PyEval_EvalFrameDefault
_PyEval_EvalFrameDefault() {
    /* 0. Definition of marcos */
    // ...

    /* 1. Push a new frame to stack, as entering a new code block. */
    // ...

    /* 2. Invoke trace function with event: PyTrace_CALL  */
    // ...
    call_trace_protected(..., PyTrace_CALL, ...)
    // ...

    /* 3. Loop for bytecode dispatch */
    for (;;) {
    /* 4. Invoke trace function with event: PyTrace_LINE */
    fast_next_opcode:
        // ...
        maybe_call_line_trace(..., PyTrace_LINE, ...)
        // ...

    /* 5. Dispatch opcode */
    dispatch_opcode:
        // ...
        switch (opcode) {
            // ...
        }

/* 6. Handle errors and invoke trace function with event: PyTrace_EXCEPTION */
error:
        // ...
        call_exc_trace(...)
        // ...

/* 7. Handle the end of block, unwind remaining blocks */
fast_block_end:
        // ...
    }
    // ...

/* 8. Invoke trace function with event: PyTrace_RETURN */
fast_yield:
    // ...
    call_trace(..., PyTrace_RETURN, ...)  // or `call_trace_protected()`
    // ...

/* 9. Pop frame from stack, as exiting a code block */
exit_eval_frame:
    // ...
}
```

With the simplified code above, we can roughly understand the execution flow of a CPython interpreter. Besides, timing of each trace event documented in `trace_dispatch()` is also found out now (those sections are marked at the code block above):
- 'call': section_02, PyTrace_CALL
- 'line': section_03, PyTrace_LINE
- 'exception': section_06, PyTrace_EXCEPTION
- 'return': section_08, PyTrace_RETURN

Therefore, answer of [our guess mentioned in previous section](#goal_of_tracing_pdb_source) is revealed:
1. Frame stack is not controlled by a single function, it related to the recursive execution of `_PyEval_EvalFrameDefault()`. (further reading: [cpython/Objects/call.c][cpython_object_call_function])
2. There is nothing like an event issuer, tracing events are issued after entering those execution blocks.


## So, how would `pdb` work with line tracing
There is an interesting function named `maybe_call_line_trace()`, and you can see that it will be invoked whenever there is a new `opcode` is going to be dispatched (see also [here][cpython_ceval_call_line_trace]).

But we should note that there is a prefix `maybe`, which indicates that function actually won't invoke a trace function everytime when it is executed. It does make sense, because what is going to be dispatched here is **bytecode**, rather than **source code** we written. And one line of source code usually can be compiled to multiple lines of bytecode.

Now, another question comes up: "How does it knows when to invoke trace function for line tracing since `maybe_call_line_trace()` locates inside a loop for dispatching bytecode?"
It's not a hard problem to be answered after checking out how it is implemented:
```cpp
// @cpython/Python/ceval.c::maybe_call_line_trace
static int
maybe_call_line_trace(Py_tracefunc func, PyObject *obj,
                      PyThreadState *tstate, PyFrameObject *frame,
                      int *instr_lb, int *instr_ub, int *instr_prev)
{
    int result = 0;
    int line = frame->f_lineno;

    /* If the last instruction executed isn't in the current
       instruction window, reset the window.
    */
    if (frame->f_lasti < *instr_lb || frame->f_lasti >= *instr_ub) {
        PyAddrPair bounds;
        line = _PyCode_CheckLineNumber(frame->f_code, frame->f_lasti,
                                       &bounds);
        *instr_lb = bounds.ap_lower;
        *instr_ub = bounds.ap_upper;
    }
    /* If the last instruction falls at the start of a line or if it
       represents a jump backwards, update the frame's line number and
       then call the trace function if we're tracing source lines.
    */
    if ((frame->f_lasti == *instr_lb || frame->f_lasti < *instr_prev)) {
        frame->f_lineno = line;
        if (frame->f_trace_lines) {
            result = call_trace(func, obj, tstate, frame, PyTrace_LINE, Py_None);
        }
    }
    /* Always emit an opcode event if we're tracing all opcodes. */
    if (frame->f_trace_opcodes) {
        result = call_trace(func, obj, tstate, frame, PyTrace_OPCODE, Py_None);
    }
    *instr_prev = frame->f_lasti;
    return result;
}
```

Clearly, we can know that:
1. There is a function `_PyCode_CheckLineNumber()` which is used to find the upper and lower bound of index of bytecode instruction (denoted as `instr_lb` and `instr_ub`; further reading: [line number table][lnotab_notes]).
2. `frame.f_lasti` is an index of the lastest executed bytecode instruction.
3. Just like the comment shown above: once we are just entering a new interval of bytecode instructions (`frame->f_lasti == *instr_lb`) or an operation of jumping backward has been executed (e.g. block of `for`/`while` loop), trace function will be invoked (of course, only when the flag `frame->f_trace_lines` is set).
4. If the flag `frame->f_trace_opcodes` is set, trace function will be invoked with an event argument `PyTrace_OPCODE`.

Besides, we got a useful information from it:
> Line number of source code is evaluated only when it need to be used.

Though that is not a topic of this article, it shows itself as a part of the reason why a Python script runs slower under a line tracing mode or profiling mode.


## In `bytefall`...
Figuring out how the mechanism of line tracing works in CPython not only helps me to complete [the part of bytecode dispatch][bytefall_run_frame] in `bytefall` VM, but also make it possible to run `pdb` in `bytefall` VM like the way it is used in a normal Python runtime.

But it's just a part of implementation of this feature, we still need to make some modifications to make it work properly. If you are interested in it, you can also check out [this file][bytefall_compat_tracing_pdb_wrapper] for the `Pdb` wrapper I wrote.


## Further reading
If you are interested in this topic, I recommend you read this nice article: ["How C trace functions really work - by Ned Batchelder"][nedbat_blog_trace_function].


[byterun_todo_call_traceback]: https://github.com/nedbat/byterun/blob/62f9b1a9c85f52c28b78cc8942243c5c962b1954/byterun/pyvm2.py#L325-L327
[doc_inspect_frame]: https://docs.python.org/3/library/inspect.html#types-and-members
[doc_sys_settrace]: https://docs.python.org/3/library/sys.html#sys.settrace
[cpython_object_call_function]: https://github.com/python/cpython/blob/39680fb7043e555469e08d3c4f49073acca77b20/Objects/call.c#L385-L440
[cpython_ceval_call_line_trace]: https://github.com/python/cpython/blob/39680fb7043e555469e08d3c4f49073acca77b20/Python/ceval.c#L1022-L1025
[lnotab_notes]: https://github.com/python/cpython/blob/3.7/Objects/lnotab_notes.txt
[bytefall_run_frame]: https://github.com/NaleRaphael/bytefall/blob/ee207a1e9e9fc40cd54f9ccac1e1cb61b12c27dc/bytefall/vm.py#L53-L97
[bytefall_compat_tracing_pdb_wrapper]: https://github.com/NaleRaphael/bytefall/blob/ee207a1e9e9fc40cd54f9ccac1e1cb61b12c27dc/bytefall/_compat/tracing.py#L28-L69
[nedbat_blog_trace_function]: https://nedbatchelder.com/text/trace-function.html
