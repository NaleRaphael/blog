---
title: "ECMA-262-3: chapter 4 - scope chain"
date: 2019-10-01 16:45:34
tags:
- javascript
---

原文連結：[ECMA-262-3: chapter 4 - scope chain](http://dmitrysoshnikov.com/ecmascript/chapter-4-scope-chain/)

以下內容會照著原文的架構書寫，並加入個人的解讀與其他相關的內容進去（定位不是翻譯文）。


## Introduction
> As we already know from the [second chapter][ecma-262-3-chpt-2] concerning the *variable object*, the data of an [execution context][ecma-262-3-chpt-1] (variables, function declarations, and **formal parameters**\* of functions) are stored as properties of the variables object.

\* 即 function signature 中的參數名稱，可見 MDN 的這篇關於 [SyntaxError: missing formal parameter][mdn-error-missing-formal-parameter] 的說明

[ecma-262-3-chpt-1]: http://dmitrysoshnikov.com/ecmascript/chapter-1-execution-contexts/
[ecma-262-3-chpt-2]: http://dmitrysoshnikov.com/ecmascript/chapter-2-variable-object/
[mdn-error-missing-formal-parameter]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Missing_formal_parameter


> Also, we know that the variable object is created and filled with initial values every time on [entering the context][ecma-262-3-chpt-2-entering-the-execution-context], and that its updating occurs at [code execution][ecma-262-3-chpt-2-code-execution] phase.

[ecma-262-3-chpt-2-entering-the-execution-context]: http://dmitrysoshnikov.com/ecmascript/chapter-2-variable-object/#entering-the-execution-context
[ecma-262-3-chpt-2-code-execution]: http://dmitrysoshnikov.com/ecmascript/chapter-2-variable-object/#code-

這段講到的東西其實就是我們常聽到的一個概念： hoisting 。
每當進入一個 execution context （以下簡稱 EC ）時， variable object （以下簡稱 VO ）就會被建立出來並把該 scope 內的變數設為本身的 property 並初始化（設定為 undefined）。而在進入執行階段後才會更新 VO 內的各項 property。

而本章節主要在說明 EC 裡面的一個細節，也就是 `scope chain` 。

## Definition
在講到 `scope chain` 之前，我們要知道什麼是 `scope` 。從比較簡單一點的角度來看，你可以想像成是下面這句話：

> 「你目前處於什麼位置，在你的視野裡能看到哪些東西？」

中的`視野`。是的，也跟 `scope` 這個單字的意義一樣。

也就是說，如果你現在站在三年一班的的講台上，那你應該是看不到三年二班的杰倫同學才對。因為你的視野就是被限制在三年一班的環境裡，除非這兩個班之間的牆被打了個洞，或是教室的蓋法比較特殊，造成類似 [Python 2 中的 list comprehension 裡的變數洩漏](https://stackoverflow.com/questions/4198906)這項問題。

<!-- 這時，廣播響起了訓導主任的聲音說道要找杰倫同學，而你也想去訓導處看看是發生了什麼事情。

在還沒反應過來時，你身邊的一個藍色貓型機器人從他的口袋拿出了一個字卡，上面寫著： `scope chain` 。是的，如果你不知道訓導處在哪棟大樓，那麼你要怎麼到達那裡呢？而你想到，訓導處是屬於學校底下的一個處室，所以應當能夠從校園地圖中找到訓導處的位置。
而這也像是 `scope chain` 的功能：它會幫你由上而下地紀錄 scope 的順序（學校 -> 某大樓 -> 訓導處）， -->


- 補充：
    在 Python 中，對 scope 的解析順序也是有先後之分的，依序為 `Local -> Enclosed -> Global -> Built-in` ，其中 `Enclosed` 其實就是 `closure` 的概念。
    而這個概念其實可以類比到這篇所提到的 `scope chain` ，因為都是在處理一個 scope 中的物件指向的是哪個東西。
    也因為有這樣的解析順序，所以在 Python 中可以見到一些對 `import` 進來的物件再次做更細節的綁定，讓物件處於更貼近執行期間的 scope ，也減少變數名稱的解析時間（相對地增加效能）。
    而關於 Python 對於 scope 的解析，除了[官方文件][python-doc-scope-namespace]以外，也可以仔細咀嚼一下這篇文章 [A Beginner's Guide to Python's Namespaces, Scope Resolution, and the LEGB Rule][python-scope-and-namespace-LEGB-rule] 。

    <!-- TODO: check numpy source code -->
    [python-doc-scope-namespace]: https://docs.python.org/3/tutorial/classes.html#python-scopes-and-namespaces
    [python-scope-and-namespace-LEGB-rule]: http://sebastianraschka.com/Articles/2014_python_scope_and_namespaces.html
    

回到原文，由於我們知道 ECMAScript 允許我們在 function 裡面再建立一個 function ，並能將內層的那個 function 當作回傳值傳出，所以我們可以實作出下方範例：

```javascript
var x = 10

function foo () {
  var y = 20

  function bar () {
    console.log(x + y)
  }

  return bar
}

foo()()  // console: 30

// Because:
// step 1:
//   foo()()
//   <---> which returns `bar`
// step 2:
//     bar()
//     <---> which executes `alert(x + y)`
//   a. While `y` does not exist in the scope of `bar`
//   but inside the scope of `foo`, we got `y` with the value `20`.
//   b. While `x` does not exist in the scope of `bar` and `foo`
//   but inside the scope of `global`, we got `x` with the value `10`.
//   c. Thus, `x + y` is `10 + 20`.
```

之所以做到這個效果，是因為每個 EC 都有它自己的 VO （對於被呼叫的函數，則是建立 activated object ，以下簡稱 AO）。 EC 是隨著執行步驟一層一層地建立出來，而 VO/AO 也是同時跟著一層一層的串起。所以對於上面範例而言， "bar" 的 scope chain 就包含了： AO(bar), AO(foo), VO(global) 。

這也對應到原文中的引言：

> *Scope chain* is related with an execution context a *chain of variable objects* which is used for variables lookup at *identifier resolution*\*.

\* `identifier resolution` ：也就是名稱的解析。我們須藉著 scope chain 去解析出目前執行到的某個 identifier 到底是什麼。而關於 identifier 的定義，可以往回看 [ECMA-262-3-chapter-3-this](http://dmitrysoshnikov.com/ecmascript/chapter-3-this/) 裡面的說明，或是參考下一段的解說。


接著：

> The scope chain of a function context is created at function *call*\* and consists of the *activation object* and the internal *[[Scope]]* property of this function.

\* scope chain 的建立是在一個函數**被呼叫**的時候

所謂的 `[[Scope]]` property ，是被定義在一個 activated EC 裡面的，紀錄著該 EC 能夠用來做 `identifier resolution` 的 scope chain ，其可以視為以下的一個物件架構：

```javascript
activeExecutionContext = {
  VO: {...},  // or AO
  this: thisValue,
  Scope: [  // Scope chain
    // list of all variable objects
    // for identifiers lookup (identifier resolution)
  ]
}
```

<h6 id="anchor-scope-definition" style="visibility:hidden;"></h6>

而 `Scope` 可以被定義為：

```javascript
Scope = AO + [[Scope]]
```

若要以 ECMAScript 裡的物件來表示的話，我們可以分別：
1. 用 `array` 表示\*：

    ```javascript
    var Scope = [VOn, ..., VO2, VO1]; // scope chain
    ```

    \* 這邊 VO 的編號順序刻意與原文顛倒，是為了配合[下文](#function-activation)所述的 VO 建立順序（數字越小代表越外層，也就是越早被建立的 VO）

2. 用帶有 `__parent__` 的 `object` 表示：

    ```javascript
    var VO1 = {__parent__: null, ... other data};
    var VO2 = {__parent__: VO1, ... other data};
    // etc.
    ```

另外原文提到：在 `ECMA-262-3 specification 10.1.4` 裡也有用 "a scope chain is a *list* of objects" 來描述，但暫時不理會在實作的層面上使用一個帶有 `__parent__` 的階層鍊也是一個作法，使用 `array` 來表示也是個比較貼近 `list` 的概念，所以原文以下都會使用這種方式來敘述。

## Function life cycle
函數的生命週期可以被區分為 creation 和 activation (call) 兩個階段，以下就分別對這兩個階段進行討論。

### Function creation
> *[[Scope]]* is a hierarchical chain of all *parent* variable objects, which are above the current function context; the chain is saved to the function at its *creation*\*.

> Another moment which should be considered is that *[[Scope]]* in contrast with *Scope (Scope chain)* is the property of a *function* instead of a *context*\**.

\* `[[Scope]]` 是在函數建立的階段就被建立出來，是靜態/不可變的（原文： statically/invariably），直到函數被摧毀（原文：function destruction）才消失。

\** `[[Scope]]` 是函數的 property 而不是 context 的 property 。亦即：

```javascript
foo.[[Scope]] = [
  globalContext.VO  // === Global
]
```

### Function activation
> High light here is that the activation object is the *first* element of the *Scope* array, i.e. added to the *front of scope chain*\*:

<h6 id="anchor-scope-chain-creation-order" style="visibility:hidden;"></h6>

\* 當前被執行到的函數所建立的 AO 會是該 `scope chain` 的<span style="color:red">第一個</span>，也就如同[上方所述](#anchor-scope-definition)。而 `scope chain` 也可以表示為以下：

```javascript
Scope = AO|VO + [[Scope]]

// or
Scope = [AO].concat([[Scope]])
```

這對於 `identifier resolution` 是一個非常重要的特性，因為在做解析時，我們必須從當前的 scope 開始尋找，只有在找不到對應的 identifier 時才會往上一層 scope （更大的 scope ，同時也是 scope chain 的下一個）開始搜尋，否則 identifier 的對照會被打亂。而 `identifier resolution` 在原文中的定義為：

> *Identifier resolution* is a process of determination to which **variable object** in scope chain the variable (or the function declaration) belongs.

`identifier resolution` 這個演算法的回傳值會是一個 `Reference` 物件，詳情可以往回參考 [Chapter 3. This - 4.1 Reference type](http://dmitrysoshnikov.com/ecmascript/chapter-3-this/#-reference-type) 或是 chapter 3 筆記的[這部分](/8di-0eIeQF2FTPSjx_uLEA#Reference-type)。

而 `identifier resolution` 解析的順序，如同上面所說的，會從當前被執行到的函數所建立的 `AO` 開始做（也就是最深層的那個 scope），再依序往更上層去搜索。所以可以大概地視為下方這樣的行為：

```javascript
// --- definition of VO ---
var VO1 = {__parent__: null, ... other data};  // top scope
var VO2 = {__parent__: VO1, ... other data};
// ...
var AO = {__parent__: VOn, ... other data};    // bottom scope

// --- definition of scope chain ---
//      bottom      ->      top
Scope = [AO, VOn, ..., VO2, VO1]

// --- algorithm of `identifier resolution` ---
function resolveIdentifier(scopeChain, identifier) {
  var currentScope = scopeChain[0]  // start from `AO`
  var target = null

  while (currentScope && !target) {  // if no scope can be explored or target is found, stop iteration
    target = findIdentifier(currentScope, identifier)  // if target is not found, return `null`
    currentScope = currentScope.__parent__  // update scope to be explored
  }
  
  return Reference.from(target)  // convert `target` to an object of `Reference` type
}
```

<!-- TODO: more details about scope chain and identifier resolution -->
<!-- TODO: brief introduction of identifier resolution in Python -->

回到原文舉的例子，

```javascript
// step_01
var x = 10

function foo () {
  var y = 20
  
  // step_03
  function bar () {
    var z = 30
    console.log(x + y + z)  // step_05
  }
  bar()  // step_04
}

foo()  // step_02
```

先記住重點：
- 在 function creation 時：建立 `function.[[Scope]]`
- 在 function call 時：建立 `activation object` 和 `scope chain`

再來我們看上面這個範例的執行流程：

- step_01: from the beginning; `foo` is created ([creating `foo.[[Scope]]`](#function-creation))
    ```javascript
    // variable object of `global` context
    globalContext.VO = {
      x: 10,
      foo: <reference to function>
    }

    // at `foo` creation
    foo.[[Scope]] = [
      globalContext.VO
    ]
    ```

- step_02: After `foo` is called (creating creating activation object and [scope chain](#function-activation) of `fooContext`)
    ```javascript
    // activation object of `foo` context:
    fooContext.AO = {
      y: 20,
      bar: <reference to function>
    }

    // scope chain of `foo` context:
    fooContext.Scope = fooContext.AO + foo.[[Scope]]
    // i.e.: 
    fooContext.Scope = [fooContext.AO, globalContext.VO]
    ```

- step_03: At creation of inner `bar` function ([creating `bar.[[Scope]]`](#function-creation))
    ```javascript
    bar.[[Scope]] = [
      fooContext.AO,
      globalContext.VO
    ]
    ```

- step_04: at `bar` function call (creating activation object and [scope chain](#function-activation) of `barContext`)
    ```javascript
    // activation object of `bar` object
    barContext.AO = {
      z: 30
    }

    // scope chain of `bar` context:
    barContext.Scope = barContext.AO + bar.[[Scope]]
    // i.e.:
    barContext.Scope = [barContext.AO, fooContext.AO, globalContext.VO]
    ```

- step_05:
    綜合以上， `identifier resolution` 的結果為：

    ```raw
    - "x"
    -- barContext.AO // not found
    -- fooContext.AO // not found
    -- globalContext.VO // found - 10


    - "y"
    -- barContext.AO // not found
    -- fooContext.AO // found - 20


    - "z"
    -- barContext.AO // found - 30
    ```

    因此， `console.log(x + y + z)` 的結果為 `60`


## Scope features
以下內容則是討論在 ECMAScript 中，有哪些特色是和函數的 `[[Scope]]` 有關。

### Closures

> Actually, a *closure* is exactly a *combination of a function code and its [[Scope]] property*.

> Thus, [[Scope]] contains that *lexical environment* (the parent variable object) in which function is *created*. Variables from higher contexts at the further function activation will be searched in this lexical (statically saved at creation) chain of variable objects.

```javascript
var x = 10
function foo () {
  console.log(x)
}

(function () {
  var x = 20
  foo()  // 10, not 20
})()
```

以上述範例而言，在做 `identifier resolution` 的過程如下：

```javascript
globalContext.VO = {
  x: 10,
  foo: <reference to function>
}

foo.[[Scope]] = [globalContext.VO]

// --- after that IIFE is executed ---
iifeContext.AO = {
  x: 20
}
iifeContext.Scope = [iifeContext.AO, globalContext.VO]

// --- when `foo` is called, it try to resolve `x` from `foo.Scope`
fooContext.AO = {}

// scope chain of `foo` context
fooContext.Scope = fooContext.AO + foo.[[Scope]]
// i.e.:                 ↓ here is the `x` we want to find
fooContext.Scope = [{}, {x:10, foo: <reference to function>}]

```

因此 `foo` 裡面的 `console.log(x)` 輸出的值仍是原本位於 global scope 的 `x` 的值。
簡而言之，就是因為 `foo` 的 `[[Scope]]` 早在自己被建立時就被確定了，而當時它的視野內能看到的就只有 `var x = 10` ，所以即使後來在 IIFE 內被呼叫到，也不會因為有一個同名的 `x` 而解析成新的這個 `x`。

而另一個經典的 closure 範例如下：

```javascript
function foo () {
  var x = 10
  var y = 20
  return function () {
    console.log([x, y])
  }
}

var x = 30
var bar = foo()  // anonymous function is returned

bar()  // [10, 20]
```


> Moreover, this example clearly shows that `[[Scope]]` of a function (in this case of the anonymous function returned from function `foo`) continues to exist *even after the context in which a function is created is already finished*.

原文用這個例子來說明：我們可以從上述例子發現，即使在 `foo` 函數執行完畢後，其回傳的匿名函數的 `[[Scope]]` 還是一直存在著的。而這也是 clousure 的特色之一：它可以保留內部函數被建立時的 Scope\*，且不被外部的 identifier 影響\**！

\* 前面提到的重點，在 function creation 時：建立 `function.[[Scope]]`。所以在上述例子中，匿名函數被建立時，它的 `[[Scope]]` 為：

```javascript
anonymousContext.[[Scope]] = [fooContext.AO, globalContext.VO]
// i.e.:
anonymousContext.[[Scope]] = [{x: 10, y: 20}, {foo: <reference to function>, x: 30, bar: undefined}]
```

\** 因為每次在 scope chain 被建立時，[都會把當前被 activated 的 scope 加到 scope chain 的最前面](#anchor-scope-chain-creation-order)，所以在做 `identifier resolution` 時，就可以從相對應的 activated context 的 scope 開始找起。也因此即使更外層有同名的 identifier 時，也不會解析成外層的那個 identifier 。

而關於 closure 更細節的討論，可以見[原文的第六章](http://dmitrysoshnikov.com/ecmascript/chapter-6-closures/)。

### [[Scope]] of functions created via `Function` constructor
但是這裡一個例外情況需要注意。當我們使用 `Function` 建構子在一個 closure 內建立一個函數時，會有這樣的情況：

```javascript
var x = 10

function foo () {
  var y = 20

  function barFD {  // function declaration
    console.log(x)
    console.log(y)
  }

  var barFE = function () {  // function expression
    console.log(x)
    console.log(y)
  }
  
  var barFn = Function('console.log(x); console.log(y);')

  barFD()  // 10, 20
  barFE()  // 10, 20
  barFn()  // 10, "ReferenceError: y is not defined"
}

foo()
```

由上述例子可以發現，在 `barFn` 裡面的 `y` 並無法被存取到，而造成 `ReferenceError` 。我們回到原文繼續看：

> But it does not mean that function `barFn` has no internal `[[Scope]]` property (else it would not have access to the variable `x`)\*.

\* 這並不代表透過 `Function` 建構子所建立的 `barFn` 就沒有了 `[[Scope]]` （否則在內部也無法存取到更上層的 `x` ）

> And the matter is that `[[Scope]]` property of functions created via the Function constructor contains *always only the global object*\*.

\* 當我們使用 `Function` 建構子來動態地建立一個函數時，那個被建立出來的函數的 `[[Scope]]` <span style="color:red;">只會有 `global` 的 scope </span>。關於這點，可見 [ECMAScript specification 3 - 15.3.2.1][ECMA262-3-15_3_2_1-newFunction] 中的第 16 步（關鍵在下方引述的粗體字部分）：

> 16. Create a new Function object as specified in section 13.2 with parameters specified by parsing *P* as a $FormalParameterList_{opt}$ and boday specified by parsing *body* as a *FunctionBody*. **Pass in a scope chain consisting of the global object as the *Scope* parameter.**

[ECMA262-3-15_3_2_1-newFunction]: https://www-archive.mozilla.org/js/language/E262-3.pdf#%5B%7B%22num%22%3A731%2C%22gen%22%3A0%7D%2C%7B%22name%22%3A%22FitB%22%7D%5D

而關於透過 `Function` 建構子所建立出的函數與 closure 的討論，可以再參考[這篇文章](https://www.bennadel.com/blog/1909-javascript-function-constructor-does-not-create-a-closure.htm)。

### Two-dimensional Scope chain lookup
關於 scope chain 用於 `identifier resolution` 上的細節，還有一個重點需要注意：

> ... prototypes (if they are) of **variable objects** can be also considered — because of prototypical nature of ECMAScript: if property is not found directly in the object, its lookup proceeds in the *prototype chain*.

記得 ECMAScript 是一個 prototype-based 語言嗎？我們討論的 VO 也是一個物件，所以當我們無法在 VO 裡面找到 property 的話，也會依照 prototype 的特性：往該物件的 prototype 去搜尋是否有該 property 。

```javascript
function foo () {
  console.log(x)
}

// Dynamically add a property `x` to the prototype of `Object`
// Note that this operation affects all objects, use this carefully.
Object.prototype.x = 1

// No property `x` found in `foo`, so it continues to search in prototype of `foo`.
// (And type of `x` is `function`. However, `function` is also an `object`)
console.log(foo.x)  // hence we got `1` here
```

```javascript
function foo () {
  console.log(x)
}

// Dynamically add a property `x` to the prototype of `Object`
Object.prototype.x = 1
// We can also add a property `x` to the prototype of `Function`
Function.prototype.x = 3

// Because the prototype chain of `foo` is:
// foo.__proto__: `Function`
// -> foo.__proto__.__proto__: `Object`
// `Function` is the first element in this prototype chain, so that it will be resolved first
console.log(foo.x)  // hence we got `3` here
```

所以原文提到，這也可看作是一個 2D 的 scope chain 搜尋：
1. on scope chain links → 優先對每個 scope chain 上的 AO/VO 做搜尋
2. on every of scope chain link — deep into on prototype chain links → 如果在第一步都找不到目標，才會再對每個 scope chain 上 AO/VO 的 prototype chain 做更深入的搜尋

但是因為 AO 並沒有 prototype ，所以我們在以下的範例可以看到這樣的輸出：

```javascript
function foo () {
  var x = 20

  function bar () {
    console.log(x)
  }

  bar()
}

Object.prototype.x = 10

foo()  // 20
```

在上述例子中，我們可以發現 `bar` 裡面的 `x` 並不是 `Object.prototype.x` 的值，而是位於 `foo` 裡面的 `x` 。這也證明了 `identifier resolution` 是優先搜索 scope chain ，如果沒有搜尋到結果才會再從 prototype chain 去尋找。同時也證明了：如果 `barContext.AO` 有 prototype ，那 `x` 的值會是 10 才對。

- 補充：以上個範例來說，若以同樣的作法，我們把 `Object.prototype.x = 10` 改為 `Function.prototype.x = 10` ，並把 `foo` 裡面的 `var x = 20` 拿掉，結果為何？

    ```javascript
    function foo () {
      function bar () {
        console.log(x)
      }
      bar()
    }
    Function.prototype.x = 10
    foo()  // output: ???
    ```

    <details>
        <summary><span style="color:green; font-weight:bold;">Click me to reveal the answer</span></summary>

    ```raw
    ReferenceError: x is not defined
    ```

    此時的 `Function.prototype.x = 10` 並沒有作用，但是若改為 `Object.prototype.x = 10` 則又能得到 `10` 的結果。這點值得再深入討論…（因為這可能與不同的 JavaScript 實作有關，所以從 source code 去找原因才會是根本之道）
    </details>

### Scope chain of the global and eval contexts
這部分的話就沒有什麼特別有趣的東西囉，但是仍需要注意的是：

> The scope chain of the global context contains *only global object*. The context with code type “eval” has the same scope chain as a *calling context*.

也就是說：
1. global context 的 scope chain 只有 `global` object
    ```javascript
    globalContext.Scope = [Global]
    ```

2. 對於 `eval()` 所產生的內容，其 context 的 scope chain 跟 `callingContext` 相同：
    ```javascript
    evalContext.Scope === callingContext.Scope
    ```

### Affecting on Scope chain during code execution
而在 ECMAScript 裡，有兩個方式可以在執行階段（原文： at runtime code execution phase ）影響 scope chain ：
1. `with` block
2. `try ... catch...` block

因為這兩個 statement 會在 scope chain 的最前面加上自己的 scope ，也就是類似以下的情況：

```javascript
Scope = withObject|catchObject + AO|VO + [[Scope]]
```

這部分可參考 chapter 3 筆記的 [Reference type and null this value](/8di-0eIeQF2FTPSjx_uLEA#Reference-type-and-null-this-value)

以下，我們直接以原文中較複雜的那個例子來說明：

```javascript
var x = 10, y = 10  // step_01

with ({x: 20}) {  // step_02
  var x = 30, y = 30  // step_03
  console.log(x)  // step_04: 30
  console.log(y)  // step_05: 30
}

console.log(x)  // step_06: 10
console.log(y)  // step_07: 30
```

會有這樣的輸出，是因為：

- step_01:

    ```javascript
    // context of `global` is initialized
    globalContext.VO = {x: 10, y: 10}

    // in current scope
    Scope = [withObject, globalContext]
    ```

- step_02: entering `with` block

    ```javascript
    withObject = {x: 20}

    // in current scope
    Scope = [withObject, globalContext]
    // i.e.
    Scope = [{x: 20}, {x: 10, y: 10}]
    ```

- step_03: variable declaration
    對於 `with` 區塊內的變數宣告的動作來說，我們會先在 local scope 尋找是否已經有相同的 `identifier` ：
    - 若有，則將其更新為新的數值（一樣會經過 `identifier resolution` 的過程去搜尋 scope chain）。
    - 若無，則在 local scope 內建立這個 `identifier` 並賦值。

    ```javascript
    // for `var x = 30`:
    //        ↓ `x` is updated
    Scope = [{x: 30}, {x: 10, y: 10}]

    // for `var y = 30`
    //          ↓ not found here
    Scope = [{x: 30}, {x: 10, y: 10}]
    //                        ↓ found here, so we update it
    Scope = [{x: 30}, {x: 10, y: 30}]
    ```

- step_04:

    ```javascript
    // search in scope chain
    //        ↓ `x` is found here
    Scope = [{x: 30}, {x: 10, y: 30}]
    
    // hence we got:
    console.log(x)  // 30
    ```

- step_05:

    ```javascript
    // search in scope chain
    //                        ↓ `y` is found here
    Scope = [{x: 30}, {x: 10, y: 30}]
    
    // hence we got:
    console.log(y)  // 30
    ```

- step_06:
    在離開 `with` 區塊後， `with` 所建立的 scope 會被移除掉，所以變成：

    ```javascript
    // search in scope chain
    //       ↓ scope created by `with` is removed
    Scope = [{x: 10, y: 30}]
    ```

- step_07:

    ```javascript
    // search in scope chain
    //        ↓ `x` is found here
    Scope = [{x: 10, y: 30}]
    
    // hence we got:
    console.log(x)  // 10
    ```

- step_08:

    ```javascript
    // search in scope chain
    //               ↓ `y` is found here
    Scope = [{x: 10, y: 30}]
    
    // hence we got:
    console.log(y)  // 30
    ```

- 補充：如果不是用 `with` 而是一般的 closure ，輸出則為：

    ```javascript
    var x = 10, y = 10

    function foo () {
      var x = 30, y = 30
      console.log(x)  // 30
      console.log(y)  // 30
    }

    foo()
    console.log(x)  // 10
    console.log(y)  // 30
    ```

至於 `try ... catch ...` 區塊，我們常見的用法如：

```javascript
try {
  throw new Error('yo')
} catch (ex) {
  console.log(ex)  // Error: "yo"
}
console.log(ex)  // ReferenceError: ex is not defined
```

其實在執行 `catch` 區塊時， scope chain 就會被修改成：

```javascript
var catchObject = {
  ex: <exception object>
}

Scope = catchObject + AO|VO + [[Scope]]
```

而在離開 `catch` 區塊後， `catch` 所建立的 scope 也會被移除掉，因此最後一行的結果是 `ReferenceError`。

## Conclusion
在這個章節裡，我們討論到了許多關於 scope chain 的細節。基本上只要記住函數的生命週期中，分別在[建立](#function-creation)與[被呼叫(啟動)](#function-activation)時會做什麼處理，那麼後續對於 JavaScript 的執行流程和結果就不會有太大的問題了！
