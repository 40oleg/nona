function fold({files = [],folders = []}) {
  let bytes = files.reduce((sum,{size}) => sum+size,0), count = files.length;
  for (const folder of folders) {
    const {bytes:childBytes,count:childCount} = fold(folder);
    bytes += childBytes; count += childCount;
  }
  return {bytes,count};
}
const rootFolder = {files:[{size:8}],folders:[{files:[{size:3},{size:5}]},{folders:[{files:[{size:2}]}]}]};
console.log(JSON.stringify({...fold(rootFolder),label:'archive'}));
