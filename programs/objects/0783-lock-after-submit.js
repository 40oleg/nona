class Submission {
  constructor() { this.fields = { title: "", body: "" }; this.submitted = false; }
  set(key, value) { return Reflect.set(this.fields, key, value); }
  submit() { if (!this.fields.title || !this.fields.body) return false; Object.freeze(this.fields); this.submitted = true; return true; }
  toJSON() { return { fields: this.fields, submitted: this.submitted }; }
}
const submission = new Submission(); submission.set("title", "Note");
const early = submission.submit(); submission.set("body", "Text"); submission.submit();
console.log(JSON.stringify([early, submission.set("body", "Changed"), submission]));
