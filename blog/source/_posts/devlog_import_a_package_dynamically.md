---
title: "Import a local Python package dynamically by its path"
date: 2020-09-11 12:51:49
tags:
- devlog
- python
---

Dynamically import a module at runtime by its own location is a useful trick when there is something have to run on demand, but which cannot be determined at design time and even it's not installed in your site-package.

This is [an old question][so_67631_ans01] that have been solved in about 12 years ago, and I've adopted the solution from that StackOverflow post into my several personal projects.

But there is an inconspicuous detail took me some time to figure out when I was trying to solve the following problem:
> In an application, user can choose to use a module `mod_foo` which can be the one installed in site-package or the other one which is not installed and exists under a `vendor` directory.


## I know that is a module, but I can't import it
Let's take the following project structure as an example, and assume that we are using Python 3.7:

```raw
my_module/
  __init__.py    # -> including statements like `from .vendor import mod_foo`
  submodule_a.py
  ...
  vendor/
    __init__.py
    mod_foo_repository/
      mod_foo/
        __init__.py     # -> including statements like `from mod_foo.core import *`
        core.py
        ...
```

In order to make other submodules in `my_module` able to use `mod_foo` without considering which one to import (the one in site-package or the other one locates in `vendor` directory), we can handle this problem in `vendor/__init__.py`. That is, `mod_foo` will be exposed as a submodule under `my_module.vendor`, and we can just write the following statement to use `mod_foo` in `__init__.py`:

```python
# file: my_module/__init__.py
from .vendor import mod_foo
```

<a name='anchor_snippet_load_module'></a>
With the solution provided in [this post][so_67631_ans01], content of `vendor/__init__.py` would be:

```python
# file: `my_module/vendor/__init__.py`
USE_LOCAL_MOD = True

if USE_LOCAL_MOD:
    # Import from local directory
    def load_local_mod():
        from pathlib import Path
        import importlib.util

        this_dir = Path(__file__).parent
        dir_mod = Path(this_dir, "mod_foo_repository", "mod_foo")
        fn = Path(dir_mod, "__init__.py")

        spec = importlib.util.spec_from_file_location("mod_foo", fn)
        mod = importlib.util.module_from_spec(spec)

        spec.loader.exec_module(mod)
        return mod

    mod_foo = load_local_mod()    # expose loaded module with name `mod_foo`
else:
    # Import from site-package
    import mod_foo

__all__ = ['mod_foo']
```

<a name='anchor_traceback'></a>
However, we will get this error when we try import `my_module`:

```raw
>>> from my_module.vendor.mod_foo import foo

Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "...\my_module\__init__.py", line 2, in <module>
    from . import vendor
  File "...\my_module\vendor\__init__.py", line 19, in <module>
    imgui = load_pyimgui()
  File "...\my_module\vendor\__init__.py", line 16, in load_local_mod
    spec.loader.exec_module(mod)
  File "...\my_module\vendor\mod_foo_repository\mod_foo\__init__.py", line 5, in <module>
    from mod_foo.core import *
ModuleNotFoundError: No module named 'mod_foo'
```

## Why it failed?
It seems like a common error when we are trying to import a module which doesn't exist or things related to namespace management are messed up in `__init__.py`. But since we've known that `mod_foo` does exist, what does this error actually indicate?

From the error message shown above, we found that the module cannot be found is `mod_foo` itself rather than any submodule in it. So that we can confirm this error isn't resulted by incorrect namespace management in `mod_foo.__init__.py`. It's more likely an error occured when the import system is finding `mod_foo`.

Luckily, there is an function [`importlib.__import__()`][python_doc_importlib_dunder_import] which can be used as a alternative to the import statement we usually use, as stated in its documentation. And the reason why we are going to use this function to trace this kind of error is that it will provide more detailed traceback when it failed to import a module.

Equivalent invocation would be:
```python
import importlib
my_module = importlib.__import__('my_module')
```

And we will get the following traceback:
```raw
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "<frozen importlib._bootstrap>", line 1086, in __import__
  File "<frozen importlib._bootstrap>", line 1006, in _gcd_import
  File "<frozen importlib._bootstrap>", line 983, in _find_and_load
  File "<frozen importlib._bootstrap>", line 967, in _find_and_load_unlocked
  File "<frozen importlib._bootstrap>", line 677, in _load_unlocked
  File "<frozen importlib._bootstrap_external>", line 728, in exec_module
  File "<frozen importlib._bootstrap>", line 219, in _call_with_frames_removed
  File "<stdin>", line 1, in <module>
  File "...\my_module\__init__.py", line 2, in <module>
    from . import vendor
  File "...\my_module\vendor\__init__.py", line 19, in <module>
    imgui = load_pyimgui()
  File "...\my_module\vendor\__init__.py", line 16, in load_local_mod
    spec.loader.exec_module(mod)
  File "...\my_module\vendor\mod_foo_repository\mod_foo\__init__.py", line 5, in <module>
    from mod_foo.core import *
ModuleNotFoundError: No module named 'mod_foo'
```


Since `__import__()` is a function comes from a fronzen module, we cannot insert breakpoints by `pdb` to trace it. But it's enough for us to understand what happened underneath the execution of a import statement.

Before starting backtracing, we can try to find out where the error message comes from. Since there is only `importlib` included in this traceback, it would be a relatively easy task to find it. Let's see how to do this:

1. As we can speculate there is a constant string `"No module named"` in the `importlib/_bootstrap.py`, we find that it's declared with a variable name `_ERR_MSG_PREFIX` in this file. 

2. Then we can find that there is another prepared string formatter `_ERR_MSG` locateing right after `_ERR_MSG_PREFIX`, and which is formed with `_ERR_MSG_PREFIX + '{!r}'`. And it's actually the format of error message we got in the traceback. So that we can keep going to find out where `_ERR_MSG` is used.

3. In function `_find_and_load_unlocked()`, we find the following lines:
    ```python
    def _find_and_load_unlocked(name, import_):
        # ...
        if spec is None:
            raise ModuleNotFoundError(_ERR_MSG.format(name), name=name)
        else:
            module = _load_unlocked(spec)
        # ...
    ```

    With this clue, we can speculate that here is the location where the error raised.

    However, note that we cannot actually get the detail of error simply from this traceback if a module is imported by the built-in `import` statement. And this is why you can see the last few lines of traceback message are not generated from `importlib._bootstrap` module. Despite of this limitation, we can still understand the possible cause from the other part of function calls.


Let's keep going on checking out the call stack, those function calls in `<frozen importlib._bootstrap>` are invoked because we are using `importlib.__import__()`. And remember where `ModuleNotFoundError` is raised? It comes from `_find_and_load_unlocked()` and this function call exists in this traceback. So it's worthy to have a further investigation, let's see how it's implemented:

```python
def _find_and_load_unlocked(name, import_):
    path = None
    parent = name.rpartition('.')[0]
    if parent:
        if parent not in sys.modules:
            _call_with_frames_removed(import_, parent)
        # Crazy side-effects!
        if name in sys.modules:
            return sys.modules[name]
        parent_module = sys.modules[parent]
        try:
            path = parent_module.__path__
        except AttributeError:
            msg = (_ERR_MSG + '; {!r} is not a package').format(name, parent)
            raise ModuleNotFoundError(msg, name=name) from None

    # ----- This is the part we've just checked -----
    spec = _find_spec(name, path)
    if spec is None:
        raise ModuleNotFoundError(_ERR_MSG.format(name), name=name)
    else:
        module = _load_unlocked(spec)
    # -----------------------------------------------

    if parent:
        # Set the module as an attribute on its parent.
        parent_module = sys.modules[parent]
        setattr(parent_module, name.rpartition('.')[2], module)
    return module
```


According to the last call in traceback shown as below, the module failed to be imported is `mod_foo` and it has no parent package. So the part of `if parent: ...` will be skipped and it continues executing `spec = _find_spec(name, path)`. And the expected returned value `spec` should be `None`, so that it can correspond to the error we got.
```raw
File "...\my_module\vendor\mod_foo_repository\mod_foo\__init__.py", line 5, in <module>
    from mod_foo.core import *
ModuleNotFoundError: No module named 'mod_foo'
```


Therefore, we should take a look at `_find_spec()` and figure out why it returns `None`. Let's simplify it into the code below:
<a name='anchor_snippet_importlib_find_spec'></a>

```python
def _find_spec(name, path, target=None):
    meta_path = sys.meta_path
    if meta_path is None:
        raise ImportError("sys.meta_path is None, Python is likely "
                          "shutting down")
    if not meta_path:
        _warnings.warn('sys.meta_path is empty', ImportWarning)

    # We check sys.modules here for the reload case.  While a passed-in
    # target will usually indicate a reload there is no guarantee, whereas
    # sys.modules provides one.
    is_reload = name in sys.modules
    for finder in meta_path:
        # ... stuff for searching spec, and return spec if it's found ...
    else:
        return None
```

Now we know that returned value will be `None` only when it failed to find a spec in the loop `for finder in meta_path: ...`. And what is `meta_path`? As it's shown in the code, it's a [`sys.meta_path`][python_doc_sys_meta_path] which contains path finder objects for finding module from different types of source. We can even just print it out to understand a bit more, and here is it:
```raw
[<class '_frozen_importlib.BuiltinImporter'>, <class '_frozen_importlib.FrozenImporter'>, <class '_frozen_importlib_external.PathFinder'>]
```

Thanks for these well-named classes, it's easy to figure out what they are responsible for individually. Literally, we can speculate that:
- `BuiltinImporter`: a importer for built-in modules
- `FrozenImporter`: a importer for frozen modules
- `PathFinder`: according to the docstring of it in `_bootstrap_external.py`, it's a meta path finder for `sys.path` and package `__path__` attributes

What we are interested in is `PathFinder` because we are solving an issue resulted by importing a normal module. And `sys.path` is also more suspectful than `__path__` attributes to be investigated further now.

<a name='anchor_cause_assumption'></a>
As we've known that `sys.path` is a list containing paths of package including those ones from site-package and so on, the problem is obviously resulted by the absent name `mod_foo` in `sys.path`. In other words, this `ModuleNotFoundError` is raised because it failed to find `mod_foo` in `sys.path` even we had imported it manually by `importlib.util`.


## Let's try to solve it
Now we have figured out the cause of this error. But how can we solve it?

Let's recall [what have been done when we are trying to load `mod_foo`](#anchor_snippet_load_module):
- Location of module is found and existing
- `mod_foo` is loaded (`spec.loader.exec_module(mod)`)
- `mod_foo` is stored into a varaible with same name and exposed in `vendor.__init__.py`

Till now, it seems we didn't miss things for loading this module. So let's go back to [the location](#anchor_traceback) where this error is caught and insert a breakpoint before executing the line.

```python
# in mod_foo.__init__.py
# ...
import pdb; pdb.set_trace()     # <- add this
from mod_foo.core import *
```

As we re-run the command for importing `my_module`, program will stop at the line where the breakpoint is set. And remember the [cause](#anchor_cause_assumption) assumed in previous section? Now we can check whether path of `mod_foo` exisits in `sys.path` by the following commands:

```python
(pdb) import sys;
(pdb) for v in sys.path: print(v)
# ... lots of path will be printed here ...
```

Bingo, path of `mod_foo` is actually absent in `sys.path`. Therefore, we can try to insert that path into `sys.path` and check whether it would work.

```python
# continue from previous session
(pdb) import os.path as osp
(pdb) sys.path.insert(0, osp.dirname(__file__))

# try to import `mod_foo`
(pdb) import mod_foo    # -> import successfully
```

Great! It actually works. But since it's usually not recommended to manipulate `sys.path` directly even though it would be reset after re-runing your program, we have to implement another better solution.


## A better solution
Remember that we've already load `mod_foo` successfully in the function `load_local_mod()`? We can just modify it slightly to make all these thing work.

Recall the implementation of [`_find_spec()`](#anchor_snippet_importlib_find_spec), there is a line of code `is_reload = name in sys.modules`. As it's stated in the comment above it, we can try to register `mod_foo` into `sys.modules` and make it marked as a module going to be reloaded.

To do this, we can simply modify our implementation to this one:
```python
# file: `my_module/vendor/__init__.py`
import sys
USE_LOCAL_MOD = True

if USE_LOCAL_MOD:
    # Import from local directory
    def load_local_mod():
        from pathlib import Path
        import importlib.util

        this_dir = Path(__file__).parent
        dir_mod = Path(this_dir, "mod_foo_repository", "mod_foo")
        fn = Path(dir_mod, "__init__.py")

        spec = importlib.util.spec_from_file_location("mod_foo", fn)
        mod = importlib.util.module_from_spec(spec)

        sys.modules['mod_foo'] = mod    #  <- (1) register `mod_foo`
        spec.loader.exec_module(mod)

        # (2) register `mod_foo` with a name prefixed with our module
        module_name = 'my_module.vendor.imgui'
        sys.modules[module_name] = mod

        return mod

    mod_foo = load_local_mod()
else:
    # Import from site-package
    import mod_foo

__all__ = ['mod_foo']
```

In the snippet above:
1. That's how we register a module into `sys.modules`
2. Without this, import statements in our submodule will fail when we are trying to perform a relative import, e.g. `from .vendor import mod_foo`. And we will get this error: `ModuleNotFoundError: No module named 'my_module.vendor.mod_foo'`


## Ta-da! You may also want to know this
Without performing the second module registration `sys.modules[module_name] = mod`, you might run into this hidden issue:
> If there is a `mod_foo` already installed in your site-package, this local import will be sucessful. But `mod_foo.core` **is actually the one installed in your site-package** rather than this local one.


## Finally
As always, here is [a file][gh_codememo_vendor_init] for those things we've talked here. Hope this can help you understand it more quickly.

Besides, I found that there is **ALREADY** [an answer posted under that StackOverflow post][so_67631_ans02].

<style>
.centered-img {
    margin: auto;
    display: block;
}
</style>

<img class="centered-img" src="https://i.kym-cdn.com/entries/icons/mobile/000/027/475/Screen_Shot_2018-10-25_at_11.02.15_AM.jpg" alt="meme_surprise_pikachu" width="320"> 

But still hope you enjoy this article!


[so_67631_ans01]: https://stackoverflow.com/a/67692
[so_67631_ans02]: https://stackoverflow.com/a/50395128
[python_doc_importlib_dunder_import]: https://docs.python.org/3/library/functions.html#__import__
[python_doc_sys_meta_path]: https://docs.python.org/3/library/sys.html#sys.meta_path
[gh_codememo_vendor_init]: https://github.com/NaleRaphael/codememo/blob/6ae07b5/codememo/vendor/__init__.py#L27-L93
[meme_surprise_pikachu]: https://i.kym-cdn.com/entries/icons/mobile/000/027/475/Screen_Shot_2018-10-25_at_11.02.15_AM.jpg
