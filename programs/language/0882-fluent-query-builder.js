class Query {
  constructor(rows) { this.rows = rows; }
  where(test) { return new Query(this.rows.filter(test)); }
  select(project) { return new Query(this.rows.map(project)); }
  append(...rows) { return new Query([...this.rows,...rows]); }
  result() { return this.rows; }
}
const query = new Query([{name:'A',score:3},{name:'B',score:8}]);
const result = query.append({name:'C',score:6}).where(row => row.score >= 6).select(row => row.name);
console.log(JSON.stringify(result.result()));
console.log(query.result().length);
