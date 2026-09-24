"use strict";

function receiverAndArguments(value) {
  console.log(this === undefined);
  value = 2;
  console.log(arguments[0]);
  arguments[0] = 3;
  console.log(value);
}

receiverAndArguments(1);

try {
  missing = (console.log("rhs"), 1);
} catch (error) {
  console.log(error.name);
}

const object = {};
Object.defineProperty(object, "fixed", {value: 1});
try {
  object.fixed = 2;
} catch (error) {
  console.log(error.name);
}

function restricted() {}
try {
  console.log(restricted.caller);
} catch (error) {
  console.log(error.name);
}
