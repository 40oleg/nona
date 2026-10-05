async function main() {
  const rows = [{ version: 1, fullName: 'Ada Lovelace' }, { version: 2, first: 'Ben', last: 'Stone' }];
  const migrated = await Promise.all(rows.map(async original => {
    let row = { ...await Promise.resolve(original) };
    while (row.version < 3) {
      if (row.version === 1) {
        const [first, last] = row.fullName.split(' ');
        row = { version: 2, first, last };
      } else if (row.version === 2) {
        row = { version: 3, display: row.last + ', ' + row.first, initials: row.first[0] + row.last[0] };
      } else throw new Error('unsupported version');
      await Promise.resolve();
    }
    return row;
  }));
  console.log(JSON.stringify(migrated));
}
main().catch(error => { throw error; });
