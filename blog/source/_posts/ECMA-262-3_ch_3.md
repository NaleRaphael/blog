---
title: "ECMA-262-3: chapter 3 - this"
date: 2019-09-27 15:28:13
tags:
- javascript
---

原文連結：[ECMA-262-3: chapter 3 - this](http://dmitrysoshnikov.com/ecmascript/chapter-3-this/)

以下內容會照著原文的架構書寫，並加入個人的解讀與其他相關的內容進去（定位不是翻譯文）。


## Introduction
> Many programmers are used to thinking that the `this` keyword in programming languages is closely related to the object-oriented programming, exactly referring the newly created object by the constructor. In ECMAScript this concept is also implemented, however, as we will see, here it is not limited only to definition of created object.

其實在我第一次嘗試去了解 JavaScript 的 `this` 時，也有點陷入如上文所說的情況。雖然以物件導向的觀點來理解 `this` 確實有不小的幫助，但是如果沒有更深入了解 Javascript 的 `this` ，很容易就會誤用。
像是之前在試做一個 todo list 時，為了動態地將一個 object method 綁定到新建立的按鈕上後，在該 method 裡面可以用 `this` 去抓到 object 本身的其他 method 來處理事情，卻發現 `this` 指向的是按鈕而不是原本那個 method 所屬的 object。（可見下方範例或此[連結(codepen)](https://codepen.io/naleraphael/pen/NWKVxBy)）

```html
<button id="btn1" onclick="manager.show(this)">Button 1</button>
<!-- after clicked -->
<!-- > Object { id: "manager" } -->
<!-- > <button id="btn1" onclick="manager.show(this)"> -->

<button id="btn2">Button 2</button>
<!-- after clicked -->
<!-- > <button id="btn2"> -->
<!-- > click { target: button#btn2, buttons: 0, clientX: 114, clientY: 17, layerX: 114, layerY: 17 } -->
```

```javascript
class Manager {
  constructor () {
    this.id = 'manager'
  }
  
  show (arg) {
    console.log(this)
    console.log(arg)
  }
}

const manager = new Manager()
let btn2 = document.getElementById('btn2')
btn2.addEventListener('click', manager.show, false)
```

- 補充:
    JavaScript 中 `this` 的概念並不完全與 Python 的 `self` 一樣。
    JavaScript 中 `this` 會指向實作的上一層對象，而 Python 的 `self` 則是用來表示物件方法(object method)內指向的物件本身（如同定義 `classmethod` ，一般 object method 的 signature 中第一個參數就是指向該 method 所綁定的物件本身）。
    另外，Python 中的 `self` 並不是一個 builtin keyword ，只能算是一個**約定成俗**的一個慣用字，可見下方例子

    ```python
    class Foo(object):
      def echo(self):
        print(self)

      def echo2(me):
        # we can replace name of the first argument with another one
        print(me)


    if __name__ == '__main__':
      foo = Foo()
      foo.echo()  # <__main__.Foo object at 0x7f12febd8a10>
      foo.echo2() # <__main__.Foo object at 0x7f12febd8a10>

    ```

## Definition
> `this` is directly related to the type of executable code of the context. The value is determined *on entering the context** and is *immutable*** while the code is running in the context.

\* `this` 的值是在進入執行階段時才會被決定的，因此我們可以透過一些方式將一段有使用到 `this` 的程式碼重新綁定到其他物件上，使該段程式碼有不同的輸出。（後面會提到）
\** `this` 是 immutable 的物件，也就是說一旦它的值被指定後，就無法再由後續的行為去改變那個值。

## `this` value in the global code
在 global scope 底下， `this` 指向的物件就是 `global object` 本身 (`Object [global]` in node.js, `Window` in browser)
```javascript=
// explicit property definition of the global object
this.a = 10;
console.log(a);  // console: 10

// implicit definition via assigning to unqualified identifier
b = 20;
console.log(b);  // console: 20

// also implicit via variable declaration because variable
// object of the global context is the global object itself
var c = 30;
console.log(this.c);  // console: 30

// equality check
console.log(this === global);  // console: true; in node.js runtime
console.log(this === window);  // console: true; in browser
```


## `this` value in the function code
> The first (and, probably, the main) feature of `this` value in this type of code is that here it is not *statically bound** to a function.

> As it has been mentioned above, *`this` value is determined on entering the context***, and in case with a function code the value can be absolutely different every time.

\*, ** 如同上面所說的，`this` 並不是靜態地被綁定在一個函數裡面，而是在進入一個 execution context 後才被決定。

> However, at runtime of the code `this` value is immutable, i.e. it is not possible to assign a new value to it since `this` is not a variable (in contrast, say, with *Python programming language and its explicitly defined `self` object which can repeatedly be changed at runtime**)

\* Python 中的 `self` 是可以被重新綁定的，詳情請見下方範例

```python
# https://repl.it/@naleraphael/pyobjectselfrebinding
class Foo(object):
  def __init__(self):
    self.name = 'Foo'

  def say_my_name(self):
    print(self.name)


class Bar(object):
  def __init__(self):
    self.name = 'Bar'

  def say_my_name(self):
    print(self.name)

  def say_my_name_proxy(self, target):
    self = target   # rebind `self` with another object
    self.say_my_name()


if __name__ == '__main__':
  bar = Bar()
  bar.say_my_name()  # Bar
  bar.say_my_name_proxy(Foo())  # Foo
```

回到原文，我們用以下的範例來說明 `this` 指向的對象

```javascript=
var foo = {x: 10}
var bar = {
  x: 20,
  test: function () {
    console.log(this === bar)
    console.log(this.x)

    // this = foo  // <- SyntaxError: invalid assignment left-hand side
    // console.log(this.x)  // the line above is failed to be compiled, so this line won't work
  }
}
```

- 情況 1:
```raw
> bar.test()

// Output in console
true
20
```

- 情況 2:
```raw
// rebind `bar.test` to the new property `test` of `foo` object
// so that `this` in the function `test` will point to the object `foo`
> foo.test = bar.test
> foo.test()

// Output in console
false
10
```

<h6 id="section-this-value-in-function-call-quote-2" style="visibility:hidden;"></h6>

再來，原文提到

> First, in a usual function call, **`this` is provided by the caller which activates the code of the context**, i.e. the parent context which calls the function. And the value of this is determined by the form of a call expression (in other words by the form how syntactically the function is called).

也就是說，在一般的函數呼叫形式下，一段 execution context (EC) 內的 `this` 是由啟動 (activate) 該 EC 的 caller 提供。而 `this` 的值則是由呼叫的形式 (form of a call expression) 決定，也就是該函數的呼叫方式。以下為原文的範例，說明了一個函數透過不同的呼叫方式會讓其中的 `this` 指向不同的物件：

```javascript=
// --- example 01 ---
function foo () {
  console.log(this)
}

foo()  // console: global (in node.js runtime); Window (in browser)

console.log(foo === foo.prototype.constructor)   // console: true

// In this expression, the parent context of `constructor` is `foo.prototype`
foo.prototype.constructor()  // console: foo.prototype

// --- example 02 ---
var foo = {
  bar: function () {
    console.log(this)
    console.log(this === foo)
  }
}

foo.bar()  // console: foo, true

// Declare an variable `exampleFunc`, and pass the address of `foo.bar` to it
var exampleFunc = foo.bar

console.log(exampleFunc === foo.bar)  // console: true, they point to the same address

// In this expression, the parent context of `exampleFunc` is `global`
exampleFunc()  // console: global, false
```

- 補充 1:
    接續上述的 example 02 ，如果我們又動態的改變了 `foo.bar` ，那麼 `exampleFunc()` 的輸出是？

    ```javascript=
    var foo = {
      bar: function () {
        console.log(this)
        console.log(this === foo)
      }
    }
    var exampleFunc = foo.bar
    exampleFunc()  // console: global, false

    // Then, we update the function `foo.bar`
    foo.bar = function () { console.log('yo') }
    foo.bar()  // console: 'yo'
    exampleFunc()  // console: ???
    ```

    <details>
        <summary>Answer</summary>

    ```raw
    // console: global, false
    Reason:
    In the line ```var exampleFunc = foo.bar```,
    `example` got a copy of address of the function `foo.bar`.
    So that it won't be affected after `foo.bar` is updated.
    ```
    </details>

- 補充 2: [Object.prototype.constructor | MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/constructor)

## Reference type
*Spoiler: 本段可用來解釋上一段中 `foo()` 與 `foo.prototype.constructor()` 輸出結果不同的原因*
*Note: 這邊的 `Reference` 是對於 object 與其所在 scope 的描述，與 `pass by value / reference` 中的 `reference` 講的不是一樣的概念*

`Reference` type 可以用以下的虛擬程式碼來表示（當作一個物件來看待時）

```javascript
var valueOfReferenceType = {
  base: <base object>,  // base object of this object belongs
  propertyName: <property name>,  // name of this object
  // strict: <boolean>,  // added in ES5, it will be `true` when `strict mode` is enabled
};
```

而 `Reference` type 的值只會有兩種：
    1. `identifier` (variable names, function names, names of function arguments and names of *unqualified properties** of the global object; see also [Chapter 4. Scope chain](http://dmitrysoshnikov.com/ecmascript/chapter-4-scope-chain/))
    2. `property accessor`

\* unqualified properties: (待確認) 所謂的 `qualified property` 是指一個 **可以被設定的 (configurable)** 屬性。所以 `unqualified property` 也就是無法被設定的屬性。但是在這要注意，原文強調的是 *unqualified properties of the global object* ，所以可能表示：

    只有在隸屬於 global object 的 `unqualified property` 才可以被當作 `identifier`

參考: [Delete in strict mode | MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Delete_in_strict_mode#What_went_wrong)

---

所謂的 `identifier` ，以下列位於 global scope 底下的變數與函數為例：

```javascript
var foo = 10;
function bar () {}
```

其在 **操作的過程中** (原文: intermediate results of operations) ，會被解析成：

```javascript
var fooReference = {
  base: global,
  propertyName: 'foo'
}
var barReference = {
  base: global,
  propertyName: 'bar'
}
```

而當我們要從這些 `Reference` type 取得那些物件的實際值時，我們會透過一個像是以下虛擬程式碼的一個方法 `GetValue` 來達成：

```javascript
// see also: ES3 sepcification - 8.7.1 GetValue
// https://www-archive.mozilla.org/js/language/E262-3.pdf
function GetValue (value) {
  if (Type(value) != Reference) {
    return value;
  }

  var base = GetBase(value);

  if (base === null) {
    // NOTE: we can tell the cause of `ReferenceError` and `TypeError` by this?
    // - TypeError: a is undefined (e.g. `var a; a.b`)
    // - ReferenceError: a is not defined (e.g. `a`)
    throw new ReferenceError;
  }

  // `[[Get]]`: returns the real value of object’s property, including as well
  // analysis of the inherited properties from a prototype chain
  return base.[[Get]](GetPropertyName(value));
}
```

而 `property accessor` ，也就是物件的屬性存取子，如下所示

```javascript
var foo = { a: 1 }
foo.a  // <- `a` is a property accessor of object `foo`
foo['a']  // <- `a` is a property accessor of object `foo`
```

---

而我們要如何決定一個 function context 內所使用到的 `this` 指的是誰呢？基本上我們可以照著以下的規則來決定：

> The value of `this` in a function context is provided **by the caller and determined by the current form of a call expression*** (how the function call is written syntactically).

<h6 id="anchor-call-parentheses" style="visibility:hidden;"></h6>

> If on the left hand side from the call parentheses `( ... )`** , there is a value of `Reference` type then `this` value is set to the *base object* of this value of `Reference` type.

> In all other cases (i.e. with any other value type which is distinct from the `Reference` type), `this` value is always set to `null`. But since there is no any sense in `null` for `this` value, it is *implicitly* converted to *global object*.

\* 其實就是前面原文有提到的: *And the value of this is determined by the form of a call expression (in other words by the form how syntactically the function is called).*

\** 也就是呼叫函數時的那個表示式中最後的那兩個小括弧

```javascript
foo()
// ↑ this
```

所以綜合上述規則，最白話的講法就是：
    先看函數呼叫的那段表示式中，函數的前面長什麼樣子：
    1. 如果是 `a.b.func()` ，那麼 `this` 指的就是 `a.b` 的 `Reference` type 中的 `base` object
    2. 如果是 `func()` ，那麼 `this` 則為 `null`。（但會根據 runtime 的不同而有不一樣的預設值，像是在 node.js 中為 `global` ，瀏覽器中為 `Window`）

再以原文中的三個例子來看，就可以知道為何 `this` 會是那樣的值：

```javascript
// --- example 01 ---
function foo () {
  return this
}

// `Reference` type of `foo`:
// var fooReference = {
//   base: global,
//   propertyName: 'foo'
// }
foo()  // console: global


// --- example 02 ---
var foo = {
  bar: function () {
    return this
  }
}

// `Reference` type of `foo.bar`:
// var fooBarReference = {
//   base: foo,
//   propertyName: 'bar'
// }
foo.bar()  // console: foo


// --- example 03 ---
var test = foo.bar

// `Reference` type of `test`:
// var fooReference = {
//   base: global,
//   propertyName: 'test'
// }
test()  // console: global
```

回到上一段（`this` value in the function code）的例子，我們也就可以知道為何 `foo.prototype.constructor()` 會印出 `foo.prototype` 了，因為其 `Reference` type 為：

```javascript
var fooPrototypeConstructorReference = {
  base: foo.prototype,
  propertyName: 'constructor'
}
```

---

因此，我們也可以利用 `this` 的這些機制，達成以下的功能：

```javascript
function foo () {
  console.log(this.bar)
}

var x = {bar: 10}
var y = {bar: 20}

// bind `foo` to the property `test` of each object
x.test = foo
y.test = foo

x.test() // 10
y.test() // 20
```

而這樣的機制，也可以幫助我們做出類似 `Vue.js` 中所謂的 `computed property`：

```javascript
var aBagOfSand = {
  weight: 1500
}

function getWeightInGram () {
  console.log(`weight: ${this.weight} (g)`)
}

function getWeightInKilogram () {
  console.log(`weight: ${this.weight/1000} (kg)`)
}

aBagOfSand.weightInGram = getWeightInGram
aBagOfSand.weightInKilogram = getWeightInKilogram

aBagOfSand.weightInGram()  // console: weight: 1500 (g)
aBagOfSand.weightInKilogram()  // console: weight: 1.5 (kg)
```

## Function call and non-Reference type
看完上述關於 `Reference` type 的內容後，可以發現提到的都是一般的[函數呼叫情況（... in a usual function call ...）](#section-this-value-in-function-call-quote-2)。

那麼是否代表有所謂 **非一般的函數呼叫** 呢？
其實就是指在 [`call parentheses ( ... )`](#anchor-call-parentheses) 的左側不是 [`Reference` type](#reference-type) 的情況，如下範例所示：

```javascript
// IIFE
(function () {
  console.log(this)
})()  // output_1: ???

// Other complex exmaples
var foo = {
  bar: function () {
    console.log(this)
  }
}

foo.bar()  // output_2: ???
(foo.bar)()  // output_3: ???

(foo.bar = foo.bar)()  // output_4: ???
(false || foo.bar)()  // output_5: ???
(foo.bar, foo.bar)()  // output_6: ???
```

<details>
<summary><span style="color: green; font-weight: bold">Click me to reveal the answer!</span></summary>

```raw
output_1: global
left hand side: `function` object

output_2: `foo` object
left hand side: `Reference` type

output_3: `foo` object
left hand side: `Reference` type
Although there is a `grouping operator`* (the parentheses at the both sides of `foo.bar`), it was't applied.
- steps:
  1. (foo.bar)()
     <-------> Returned value of this expression `(foo.bar)` is `foo.bar`, which is still a `Reference` type
  2. foo.bar()
     <-------> Then, this expression is evaluated

output_4: global
left hand side: `function` object
Inside the parentheses, there is a expression with `assignment operator` which will return a value**.

output_5: global
left hand side: `function` object
- steps:
  1. (false || foo.bar)()
     <----------------> Processing this expression (`logical OR`)
  2. (false || foo.bar)
      <---> result of condition is `false`, so that we continue to check the next condition
  3. (false || foo.bar)
               <-----> result of condition is not `false` / `null` / `undefined`, so that returned value will be: `function foo.bar()`
  4. [function foo.bar()]()
     <------------------> this is a `function` object, not a `Reference` type

output_6: global
left hand side: `function` object
- steps:
  1. (foo.bar, foo.bar)()
     <----------------> Processing this expression (`comma operator`)
  2. (foo.bar, foo.bar)
      <-----> this value is evaluated, but not returned
  3. (foo.bar, foo.bar)
               <-----> this value is evaluated and returned, so that the returned value of this expression is: `function foo.bar()`
  4. [function foo.bar()]()
     <------------------> this is a `function` object, not a `Reference` type
```

\* `grouping operator`: which accepts `expression` only
\** in a console, entering the following content line by line, you will see the following result:

```javascript
> var a        // this is a statement
undefined  // returned value of this statement

> a = 1        // this is an expression
1          // returned value of this expression

// so that...
> function foo() {}  // statement
undefined

> a = foo            // expression
function foo()   // got a returned value: `function` object
```

- 補充1: [expression versus statements in JavaScript](https://2ality.com/2012/09/expressions-vs-statements.html)
- 補充2: 關於上方連結中 `3.1 Object literal versus block` 提到的東西，可以再看看這個應用 [JSFuck](http://www.jsfuck.com/)
</details>

## Reference type and null this value
除了上一段所提到的其他種 function call 與其相對應的 `this` 值，我們還有一些情況需要理解。
本段以說明那些 `this` 應該要被設為 null (也就是說最後會變成 global (node.js) 或 Window (browser)) 的情況：

1. Calling an unbound function in a closure:

```javascript
function foo () {
  function bar() {
    console.log(this)
  }
  bar()
}

foo() // console: global

// Because:
// var barReference = {
//   base: AO,  // (note*) activated object, which return `this` as null, because `AO.__parent__` is null (or in default value: `global`)
//   propertyName: 'bar'
// }
```

\* Which might be true only in some implementation of Javascript, e.g. `SpiderMonkey`, `Rhino`. See also [this chapter](http://dmitrysoshnikov.com/ecmascript/chapter-2-variable-object/#feature-of-implementations-property-__parent__)


2. In a `with` statement:

```javascript
var x = 10

with ({
  foo: function () {
    console.log(this.x)
  },
  x: 20
}) {
  foo()  // console: 20
}

// Because:
// var fooReference = {
//  base: __withObject,
//  propertyBane: 'foo'
// }
```

這部份需要注意到，此時的 `foo` 裡面的 `this` 指向的是一個 `__withObject` 而非 `global`，因此印出的 `this.x` 是 `with` statement 裡面定義的 `x` 而非 global scope 中的 `x`。

而範例則是在說明使用 `with` 時會造成的影響，關於 `with` 的效果，除了原文所述：

> The `with` statement adds its object in front of [scope chain][ecma262-3-chapt-4-scope-chain] i.e. *before* the activation object. Accordingly, having values of type `Reference` (by the identifier or a property accessor) we have base object not as an activation object but object of a `with` statement.

[ecma262-3-chapt-4-scope-chain]: http://dmitrysoshnikov.com/ecmascript/chapter-4-scope-chain/#affecting-on-scope-chain-during-code-execution

會有這樣的結果是因為在我們使用 `with` 時，會將 `with` 裡面定義的物件加到 scope chain 的前面，使得在執行階段時會優先搜尋到 `with` 內定義的物件，這部分的說明在原文（見下方）和 [MDN][`With` statement | MDN] 上也有敘述。

> By the way, it relates not only to inner, but also to global functions because the `with` object *shadows** higher object (global or an activation object) of the scope chain

\*　因為 `with` 內的物件會被優先搜索到，導致更上層 scope 中的物件會相對地被 *遮蓋掉*（對應到原文中的 `shadows`）

[`With` statement | MDN]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/with

3. In a `try ... catch ...` statement

```javascript
try {
  throw function () {
    console.log(this)
  }
} catch (e) {
  e()  // console: __catchObject - in ES3, global - fixed in ES5
}

// on idea (in normal case, implmented in ES3)
// var eReference = {
//  base: __catchObject,
//  propertyName: 'e'
// }

// In ES5 (the implementation above is regarded as a bug, so that `this` value is forced to be `global`)
// var eReference = {
//  base: global,
//  propertyName: 'e'
// }
```

而關於 `catch` 在 ES3 和 ES5 中實作的差異，請見下方：

- [`catch` block in ES3 specification](https://www-archive.mozilla.org/js/language/E262-3.pdf):
    > The production *Catch*: `catch` (*Identifier) *Block* is evaluated as follows:
    > 1. Let *C* be the parameter that has been passed to this production.
    > 2. Create a new object as if by the expression `new Object()`.
    > 3. Create a property in the object Result(2). The property's name is *Identifier*, value is *C*.value, and attributes are { DontDelete }.
    > 4. Add Result(2) to the front of the scope chain.
    > 5. Evaluate *Block*.
    > 6. Remove Result(2) from the front of the scope chain.
    > 7. Return Result(5). 

    我們可以看到在步驟 1~3 中，有一個新物件被建立出來且加上了一個 property 叫作 *Identifier*，而其值為一開始被傳入 `catch` 區塊中的參數。
    而第 4 步是一個關鍵：這時會將步驟 2 建立出的物件放到目前 scope chain 的**前面**。這也是為什麼在上述例子中，ES3 中 `eReference` 的 base 會是一個 `__catchObject`。
    而 `catch` 區塊的特性：「內部的物件只會存在這個區塊中，當執行流程離開後，便無法再次取得內部的物件」這部份則是透過步驟 6 來達成（移除掉剛剛加到 scope chain 前面的物件）。

    （題外話：看到這邊，其實可以發現在 ES3 spec 內就已經有所謂 `block` 的用詞。只是這個 `block` 和 ES6 導入的 `block scope` 有什麼關聯呢？之後再來研究看看好了）

- [`catch` block in ES5 specification](https://www.ecma-international.org/ecma-262/5.1/#sec-12.14):
    > The production *Catch*: `catch` (*Identifier) *Block* is evaluated as follows:
    > 1. Let *C* be the parameter that has been passed to this production.
    > 2. Let *oldEnv* be the running execution context’s [LexicalEnvironment][es5.1-sec10.3].
    > 3. Let *catchEnv* be the result of calling [NewDeclarativeEnvironment][es5.1-sec10.2.2.2] passing *oldEnv* as the argument.
    > 4. Call the [CreateMutableBinding][es5.1-sec10.2.1.1.2] concrete method of *catchEnv* passing the *Identifier* String value as the argument.
    > 5. Call the [SetMutableBinding][es5.1-sec10.2.1.1.3] concrete method of *catchEnv* passing the *Identifier*, *C*, and **false** as arguments. Note that the last argument is immaterial in this situation.
    > 6. Set the running execution context’s [LexicalEnvironment][es5.1-sec10.3] to *catchEnv*.
    > 7. Let *B* be the result of evaluating Block.
    > 8. Set the running execution context’s [LexicalEnvironment][es5.1-sec10.3] to *oldEnv*.
    > 9. Return *B*.

    [es5.1-sec10.3]: https://www.ecma-international.org/ecma-262/5.1/#sec-10.3
    [es5.1-sec10.2.2.2]: https://www.ecma-international.org/ecma-262/5.1/#sec-10.2.2.2
    [es5.1-sec10.2.1.1.2]: https://www.ecma-international.org/ecma-262/5.1/#sec-10.2.1.1.2
    [es5.1-sec10.2.1.1.3]: https://www.ecma-international.org/ecma-262/5.1/#sec-10.2.1.1.3

    在 ES5 中，步驟 1 與 ES3 的作法一樣，但是後續有了一些改變。這邊先簡述為何在 ES5 中，`eReference` 的 base 會變成 `global`：
    因為在步驟 6 中會將目前正在執行的 execution context 的 `Lexical environment` 設定為 *catchEnv* （為了 `catch` 區塊而新建的 `Lexical environment`） 的 execution context ，所以 `catch` 區塊可以視為原本的 execution context 的延伸，也因此 `eReference` 的 base 會指向 `global`。

4. In a recusive function call

```javascript
(function foo (bar) {
  console.log(this);
  !bar && foo(1);
})();

// console:
// global  // the first time
// global  // the second time
```

> At the first call of function, base object is the parent activation object (or the global object), at the recursive call — base object should be special object storing the optional name of a function expression.
> However, in this case `this` value is also always set to global

若依照一般的執行流程來判斷，第二次印出的結果應該要是一個物件，但是這邊卻會被設定為 `global` （而這樣才是正確的）。

## This value in function called as the constructor

再來看一個例子，當我們把一個 function 當作物件的 constructor 時：

```javascript
function A () {
  console.log(this);
  this.x = 10;
  console.log(this);
}

var a = new A();  // console: 1st line: {}; 2nd line: {x: 10}
console.log(a.x);  // console: 10
```

關於 `new` 關鍵字，可見 ES3 specification - 11.2.2：

> The production *NewExpression*: **new** *NewExpression* is evaluated as follows:
> 1. Evaluate *NewExpression*.
> 2. Call GetValue(Result(1)).
> 3. If Type(Result(2)) is not Object, throw a **TypeError** exception.
> 4. If Result(2) does not implement the internal **[[Construct]]** method, throw a **TypeError** exception.
> 5. Call the [[Construct]] method on Result(2), providing no arguments (that is, an empty list of arguments).
> 6. Return Result(5).

而關於 `this` 被綁定到新建立物件的原因在第 4 步驟中呼叫的 **[[Construct]]**，我們把它在 ES3 sepcification 的內容翻出來看：

> **13.2.2 [[Construct]]**
> When the [[Construct]] property for a Function object *F* is called, the following steps are taken:
> 1. Create a new native ECMAScript object
> 2. Set the [[Class]] property of Result(1) to **"Object"**
> 3. Get the value of the **prototype** property if the F
> 4. If Result(3) is an object, set the [[Prototype]] property of Result(1) to Result(3).
> 5. If Result(3) is not an object, set the [[Prototype]] property of Result(1) to the original Object prototype object as described in section 15.2.3.1.
> 6. Invoke the [[Call]] property of *F*, providing Result(1) as the **this** value and providing the argument list passed into [[Construct]] as the argument values.
> 7. If Type(Result(6)) is Object then return Result(6).
> 8. Return Result(1).

關鍵就在於上方的步驟 6 ：在呼叫 *F*.[[call]] 時，會將第 1 步產生的結果（即一個新的 `ECMAScript object`）設定為 `this` 的值並將其他傳進這個 `[[Construct]]` 的參數列表當作呼叫 *F*.[[Call]] 的參數值。
所以如果要用更簡化的方式來解讀這些步驟的話，就如 [MDN 上關於 `new` 關鍵字的說明](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new)：

> 1. Creates a blank, plain JavaScript object
> 2. Links (sets the constructor of) this object to another object
> 3. Passes the newly created object from Step 1 as the this context
> 4. Returns `this` if the function doesn't return its own object

這也就是為什麼在上述例子中，使用 `new` 建立一個 `a` 物件時，會先後分別看到 `{}` 與 `{x: 10}`，然後在 `console.log(a.x)` 時，可以印出 `10`。


## Manual setting of `this` value for a function call
如果要在 call function 時手動設定 `this` 的話可以使用 `apply`, `call` 這兩個方法 (ES5.1 開始支援另一個新的方法 `bind`，但是並不是用於呼叫函數時的動態綁定，因此這邊暫時不討論)

```javascript
var b = 10

function a (c) {
  console.log(this.b)
  console.log(c)
}

a(20)  // console: 10, 20  (because `this` === global)

a.call({b: 20}, 30)  // console: 20, 30 (because `this` === {b: 20})
a.apply({b: 30}, [40])  // console: 30, 40 (because `this` === {b: 30})
```

`call` 與 `apply` 的第一個參數都是接受一個物件當為綁定的對象，而差別只在於後續的參數給予方式：
    - `call` 接受的是一連串的參數，如 `a.call(obj, arg1, arg2, ...)`
    - `apply` 接受的是參數陣列，如 `a.apply(obj, [arg1, arg2, ...])`

參考： [`Function.prototype.call`](https://developer.mozilla.org/zh-TW/docs/Web/JavaScript/Reference/Global_Objects/Function/call), [`Function.prototype.apply`](https://developer.mozilla.org/zh-TW/docs/Web/JavaScript/Reference/Global_Objects/Function/apply)


## Conclusion
`this` 在 ECMAScript 的底層設計上看起來很複雜，但從我們實作的角度來看，要知道 `this` 的值其實不會很難。
基本上從 [函數的呼叫形式](#section-this-value-in-function-call-quote-2) 就可以推算出來，只是要再考慮到其他如 [Function call and non-Reference type](#function-call-and-non-reference-type) 和 [Reference type and null this value](#reference-type-and-null-this-value) ... 等比較特殊的情況而已。

當然，透過直接探索 ECMAScript specification 也能夠幫助我們更了解 `this` 的概念，像是：為什麼在我們使用 `new` 建立新物件時， `this` 的值會被自動綁定到新物件上。雖然 MDN 也有詳細的說明，但是相信對於希望能更了解根本原因的人，ECMAScript specification 絕對是個很適合的~~休閒讀物~~參考書！
