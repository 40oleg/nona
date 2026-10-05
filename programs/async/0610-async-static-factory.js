async function main() {
  class Product {
    constructor(code, price) { this.code = code; this.price = price; }
    static async from(row) {
      const [code, rawPrice] = await Promise.resolve(row.split(':'));
      const price = Number(rawPrice);
      if (!Number.isFinite(price)) throw new Error('invalid price');
      return new Product(code, price);
    }
  }
  const product = await Product.from('book:14');
  console.log(product.code + ':' + product.price * 2);
}
main().catch(error => { throw error; });
