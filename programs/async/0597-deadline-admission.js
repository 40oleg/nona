async function main() {
  const jobs = [{ id: 'a', deadline: 2, duration: 1 }, { id: 'b', deadline: 1, duration: 2 }, { id: 'c', deadline: 5, duration: 2 }];
  jobs.sort((a, b) => a.deadline - b.deadline);
  let tick = 0;
  const outcomes = [];
  for (const job of jobs) {
    if (tick + job.duration > job.deadline) { outcomes.push(job.id + ':expired'); continue; }
    tick += await Promise.resolve(job.duration);
    outcomes.push(job.id + ':done@' + tick);
  }
  console.log(JSON.stringify(outcomes));
}
main().catch(error => { throw error; });
