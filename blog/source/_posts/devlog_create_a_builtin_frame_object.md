---
title: "How to create a built-in `frame` object in Python?"
date: 2020-03-11 21:21:38
tags:
- devlog
- python
---

Recently, I ran into a problem about using `pdb` in [`bytefall`][gh_bytefall] (a Python virtual machine implemented in Python). It's not a bug-like problem, but just a curiousity-triggered one.

`pdb` worked fine in `bytefall`, but all internal execution flow will be revealed once `pdb.set_trace()` is called in a user script. It might be annoying if users don't want to get those information.

Then, a question comes to my mind:
*Is it possible to make a switch to run `pdb` with/without revealing the internal of `bytefall` virtual machine?*

During the developing of this feature, I found that the [`pyframe.Frame`][bytefall_pyframe_frame] object cannot be used as a duck-typed `frame` object while using command `ll` in `pdb`. The error we got is: `TypeError: module, class, method, function, traceback, frame, or code object was expected, got Frame`.


## Quack, you should give me a `frame` object
Here is the simplified traceback of that error:

```raw
pdb.py::do_longlist
-> pdb.py::getsourcelines
-> inspect.py::findsource
-> inspect.py::getsourcefile
-> inspect.py::getfile

# Inside `inspect.py::getfile`, `inspect.py::isframe` is called.
# And this is how `inspect.py::isframe` implemented:
def isframe(object):
    return isinstance(object, types.FrameType)
```

As we know that we can make it pass the check of `isinstance(obj, SomeType)` by making class of `obj` inheriting `SomeType`. e.g.

```python
class MyList(list):
    ...

print(isinstance(MyList(), list))
# Output: True
```

But we are not allowed to do the same thing for `frame`.

```python
import types
class MyFrame(types.FrameType):
    ...

print(isinstance(MyFrame(), types.FrameType))
# Got `TypeError: type 'frame' is not an acceptable base type`
```

Why? After googling, I found a [related post on stackoverflow][so_16056574] talking about this exception. In short, `Py_TPFLAGS_BASETYPE` is not set in the implementation of `PyFrameObject`, thus it cannot be subclassed. We can see that in [cpython/Objects/frameobject.c][frame_type_definition].

And here is the definition of that flag:
> - Py_TPFLAGS_BASETYPE  
    This bit is set when the type can be used as the base type of another type. If this bit is clear, the type cannot be subtyped (similar to a “final” class in Java).

(further reading: [PEP 253 -- Subtyping Built-in Types][link-pep253], [Python history - Metaclasses and extension classes (a.k.a "The Killer Joke")][link-guido_talking_about_metaclass])


## It not the time to give up yet
Though it's a frustrating news, I started searching with keywords like "Python, create builtin object". Then something interesting showed up: [How to create a traceback object][so_27138440].

Said by the answerer @abarnert in that post:
> The `PyTraceBack` type is not part of the public API. But (except for being defined in the Python directory instead of the Object directory) it's built as a C API type, just not documented. ... well, there's no `PyTraceBack_New`, but there is a `PyTraceBack_Here` that constructs a new traceback and swaps it into the current exception info.

It reminded me of one thing I missed before: "If one thing is an object, then there (usually) should be a **constructor**."

And, yeah, there is a function called [`PyFrame_New`][cpython_pyframe_new].

Next, we need to figure out how to call `PyFrame_New()` from Python side.

Since it's a C function, we can try to access it through `ctypes.pythonapi`. Roughly speaking, this is what we want to do:

```python
import ctypes

frame = ctypes.pythonapi.PyFrame_New(
    ...,  # thread state
    ...,  # a code object
    ...,  # a dict of globals
    ...   # a dict of locals
)
```


## Play with `ctypes`
There are a few things worth noting:
1. Before calling a `c_func`, its `argtypes` and `restype` should be given.
2. According to the signature of `PyFrame_New`, there is a pointer of `PyThreadState` object should be given. However, it isn't an object that we can access in Python directly.
3. As @abarnert mentioned:
    > Also, both are CPython-specific, require not just using the C API layer but using undocumented types and functions that could change at any moment, and offer the potential for new and exciting opportunities to segfault your interpreter.

    Compatibility and robustness of our implementation should be taken care of.

Let's start doing this step by step (to avoid confusion and being affected by the changes among versions, here we are taking CPython 3.7 as the runtime):
1. Accordint to point 1, we should rewrite the code above into this:
    ```python
    import ctypes

    ctypes.pythonapi.PyFrame_New.argtypes = (
        ...,    # PyThreadState*
        ...,    # PyCodeObject*
        ...,    # PyObject*
        ...     # PyObject*
    )
    ctypes.pythonapi.PyFrame_New.restype = (
        ...     # PyFrameObject*
    )

    frame = ctypes.pythonapi.PyFrame_New(
        ...,    # thread state
        ...,    # a code object
        ...,    # a dict of globals
        ...     # a dict of locals
    )
    ```

    But there is a problem: "Except `ctypes.py_object`, there are no other types of Python object defined as `py_threadstate`, `py_codeobject` and `py_frameobject`."

    Typically, we have to define some classes inheriting `ctypes.Structure` with `_fields_` in which all members of those internal types are defined. Then assign those classes to `argtypes` and `restype`. Take `PyThreadState` as an example, we have to deal with [**THESE THINGS**][cpython_threadstate_struct].

    Ok, it sounds like a complicated work to do, but there is actually a shortcut for this. Let's take a look at the signature of `PyFrame_New` again:
    ```c
    PyFrameObject*
    PyFrame_New(PyThreadState *tstate, PyCodeObject *code,
                PyObject *globals, PyObject *locals)
    { /* ... */ }
    ```

    <a name="ctypes_pointer_as_argument_type"></a>
    From the aspect of C, what we have to do is passing **pointers of objects** to the function. Therefore, we can use `ctypes.POINTER(...)` as a type for `PyThreadState*`, `PyCodeObject*`. (reminder: we just need to use `ctypes.py_object` for `PyObject*`)

    According to the [documentation][doc_ctypes_pointer] of `ctypes.POINTER(...)`, it takes a type defined in `ctypes` as argument. But what is the type of pointer we need to use?

    As we know that a pointer is a container storing memory address, what argument of `ctypes.POINTER(...)` takes depends on the architecture of your computer. That is, we should use `ctypes.c_ulong` for x64 and `ctypes.c_uint` for x86.

    By doing this, we are also increasing the compatibility of our implementation. And the progress of our implementation is shown as below:
    ```python
    import ctypes

    # Check whether we are on a x64 or x86 platform by checking the size of `void*`
    # 8-byte for x64, 4-byte for x86
    P_SIZE = ctypes.sizeof(ctypes.c_void_p)
    IS_X64 = P_SIZE == 8

    P_MEM_TYPE = ctypes.POINTER(ctypes.c_ulong if IS_X64 else ctypes.c_uint)

    ctypes.pythonapi.PyFrame_New.argtypes = (
        P_MEM_TYPE,         # PyThreadState *tstate
        P_MEM_TYPE,         # PyCodeObject *code
        ctypes.py_object,   # PyObject *globals
        ctypes.py_object    # PyObject *locals
    )
    # We can use `ctypes.py_object` for this. Because we are going to 
    # manipulate it in Python instead of C.
    ctypes.pythonapi.PyFrame_New.restype = ctypes.py_object     # PyFrameObject*

    frame = ctypes.pythonapi.PyFrame_New(
        ...,    # thread state
        ...,    # a code object
        ...,    # a dict of globals
        ...     # a dict of locals
    )
    ```

2. Now we are going to pass arguments to the function call `PyFrame_New()`.
    To make it easier to be understood, here we define a simple function `greet()` for setting 2nd argument up later, and directly use `globals()` and `locals()` as the 3rd and 4th argument respectively. As for the first argument `tstate`, we will talk about it in next step.

    ```python
    import ctypes

    P_SIZE = ctypes.sizeof(ctypes.c_void_p)
    IS_X64 = P_SIZE == 8
    P_MEM_TYPE = ctypes.POINTER(ctypes.c_ulong if IS_X64 else ctypes.c_uint)

    ctypes.pythonapi.PyFrame_New.argtypes = (
        P_MEM_TYPE,         # PyThreadState *tstate
        P_MEM_TYPE,         # PyCodeObject *code
        ctypes.py_object,   # PyObject *globals
        ctypes.py_object    # PyObject *locals
    )
    ctypes.pythonapi.PyFrame_New.restype = ctypes.py_object     # PyFrameObject*

    # A simple function for demonstration
    def greet():
        print('hello')

    frame = ctypes.pythonapi.PyFrame_New(
        ...,    # thread state
        ctypes.cast(id(greet.__code__), P_MEM_TYPE),    # a code object
        globals(),    # a dict of globals
        locals()      # a dict of locals
    )
    ```

    Seeing the 2nd argument of `PyFrame_New()` above? Remember that we have defined the 2nd argument type as `P_MEM_TYPE`, which is actually a pointer. So that passing `greet.__code__` directly is invalid and we will get an error like the following one:
    ```raw
    ctypes.ArgumentError: argument 2: <class 'TypeError'>: expected LP_c_ulong instance instead of code
    ```

    To meet the requirement defined in `PyFrame_New.argtypes`, we have to cast `greet.__code__` into a C pointer. Luckily, in CPython, we can get memory address of a Python object through `id()`. After that, we just need to use `ctypes.cast()` to cast it into `P_MEM_TYPE` defined above.

3. Nice! We are about to finish the function call.
    Like `PyFrameObject`, we are not able to create a `PyThreadState` object directly. Besides, a `PyThreadState` object usually relates to the interpreter you are using, rather than threads created by `threading` module. (further reading: [Thread State and the Global Interpreter Lock][doc_threadstate_and_gil])

    To access a `PyThreadState` object, it should be done through calling `PyThreadState_Get()`. Since it's a part of C-API, we have to set `argtypes` and `restype` for it, too.

    According to the [signature of it][cpython_threadstate_get], it takes no argument and returns a pointer of `PyThreadState`.
    ```c
    PyThreadState *
    PyThreadState_Get(void)
    { /* ... */}
    ```

    As the same concept mentioned in [previous step](#ctypes_pointer_as_argument_type), this is the configuration:
    ```python
    ctypes.pythonapi.PyThreadState_Get.argtypes = None
    ctypes.pythonapi.PyThreadState_Get.restype = P_MEM_TYPE
    ```

    Finally, the whole script for creating a `frame` object will be:
    ```python
    import ctypes

    P_SIZE = ctypes.sizeof(ctypes.c_void_p)
    IS_X64 = P_SIZE == 8

    P_MEM_TYPE = ctypes.POINTER(ctypes.c_ulong if IS_X64 else ctypes.c_uint)

    ctypes.pythonapi.PyFrame_New.argtypes = (
        P_MEM_TYPE,         # PyThreadState *tstate
        P_MEM_TYPE,         # PyCodeObject *code
        ctypes.py_object,   # PyObject *globals
        ctypes.py_object    # PyObject *locals
    )
    ctypes.pythonapi.PyFrame_New.restype = ctypes.py_object     # PyFrameObject*

    ctypes.pythonapi.PyThreadState_Get.argtypes = None
    ctypes.pythonapi.PyThreadState_Get.restype = P_MEM_TYPE

    def greet():
        print('hello')

    frame = ctypes.pythonapi.PyFrame_New(
        ctypes.pythonapi.PyThreadState_Get(),    # thread state
        ctypes.cast(id(greet.__code__), P_MEM_TYPE),    # a code object
        globals(),    # a dict of globals
        locals()      # a dict of locals
    )
    ```

## Anything funny to do with this created `frame`?
Yeah! As the problem mentioned at the beginning, we can start playing with `pdb` right now.
And we will talk about that in the next article.


[gh_bytefall]: https://github.com/NaleRaphael/bytefall
[bytefall_pyframe_frame]: https://github.com/NaleRaphael/bytefall/blob/ee207a1e9e9fc40cd54f9ccac1e1cb61b12c27dc/bytefall/pyframe.py#L13
[so_16056574]: https://stackoverflow.com/questions/16056574
[frame_type_definition]: https://github.com/python/cpython/blob/725cbce25084a67ad7ff48b75cca3e240ef57606/Objects/frameobject.c#L611-L644
[link-pep253]: https://www.python.org/dev/peps/pep-0253/#preparing-a-type-for-subtyping
[link-guido_talking_about_metaclass]: http://python-history.blogspot.com/2009/04/metaclasses-and-extension-classes-aka.html
[so_27138440]: https://stackoverflow.com/questions/27138440
[cpython_pyframe_new]: https://github.com/python/cpython/blob/725cbce25084a67ad7ff48b75cca3e240ef57606/Objects/frameobject.c#L782-L790
[cpython_threadstate_struct]: https://github.com/python/cpython/blob/97e92dbba9d7840a5068d7878d1393d36229882b/Include/pystate.h#L212-L304
[doc_ctypes_pointer]: https://docs.python.org/3.7/library/ctypes.html#ctypes.POINTER
[doc_threadstate_and_gil]: https://docs.python.org/3.7/c-api/init.html#thread-state-and-the-global-interpreter-lock
[cpython_threadstate_get]: https://github.com/python/cpython/blob/627e7bc1bb203b6472af567f2effee952c34b34c/Python/pystate.c#L706-L714
