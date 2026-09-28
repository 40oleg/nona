class Source {
  static /* before */ value /* after */ () { return 7; }
}
console.log(Source.value.toString(), Source.value());
