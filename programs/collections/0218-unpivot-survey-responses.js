const responses = [{person:"a",q1:4,q2:null,q3:2},{person:"b",q1:3,q2:5,q3:0}];
const answers = responses.flatMap(response => {
  return Object.entries(response)
    .filter(([key,value]) => key!=="person" && value!==null)
    .map(([question,value]) => ({person:response.person,question,value}));
});
const zeroAnswers = answers.filter(answer => answer.value===0).length;
const questionCount = new Set(answers.map(answer => answer.question)).size;
const result = {answers,zeroAnswers,questionCount};
console.log(JSON.stringify(result));
