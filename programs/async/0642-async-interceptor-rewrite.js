async function main() {
  const interceptors = [
    async response => ({ ...response, body: response.body.toUpperCase() }),
    async response => ({ ...response, length: response.body.length }),
    async response => ({ ...response, checked: response.status === 200 })
  ];
  const initial = Promise.resolve({ status: 200, body: 'hello' });
  const response = await interceptors.reduce((pending, interceptor) => pending.then(interceptor), initial);
  const keys = Object.keys(response);
  console.log(JSON.stringify([response, keys]));
}
main().catch(error => { throw error; });
