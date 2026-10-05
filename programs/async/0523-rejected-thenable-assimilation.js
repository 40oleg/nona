async function main() {
  const adapter = {
    then(resolve, reject) {
      reject(new Error('  gateway offline  '));
      resolve('ignored');
    }
  };
  let status;
  try { await Promise.resolve(adapter); }
  catch (error) { status = error.message.trim().toUpperCase(); }
  console.log(status);
}
main().catch(error => { throw error; });
