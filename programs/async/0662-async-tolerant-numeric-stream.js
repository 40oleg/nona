async function main() {
  async function* records() { for (const raw of ['4', 'oops', '8', '3']) yield await Promise.resolve(raw); }
  let sum = 0;
  const rejected = [];
  for await (const raw of records()) {
    try {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(raw);
      sum += value;
    } catch (error) { rejected.push(error.message); }
  }
  console.log(JSON.stringify([sum, rejected]));
}
main().catch(error => { throw error; });
