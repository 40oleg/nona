class SparseMatrix {
  #cells = new Map();
  set(row, col, value) { const key = row + ":" + col; if (value) this.#cells.set(key, value); else this.#cells.delete(key); }
  get(row, col) { return this.#cells.get(row + ":" + col) ?? 0; }
  multiply(vector, rows) { return Array.from({ length: rows }, (_, row) => vector.reduce((sum, value, col) => sum + value * this.get(row, col), 0)); }
  get nonzero() { return this.#cells.size; }
}
const matrix = new SparseMatrix(); matrix.set(0, 0, 2); matrix.set(0, 2, 4); matrix.set(1, 1, 3); matrix.set(1, 1, 0);
console.log(JSON.stringify([matrix.multiply([1, 2, 3], 2), matrix.nonzero]));
