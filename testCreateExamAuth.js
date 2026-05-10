const https = require('https');
const data = JSON.stringify({
  title: 'Test',
  questions: [{ id: 'q1', text: 'Hello', options:[{id:'A',text:'Opt1'}], correct:'A', explanation:'X', topics:[] }],
  duration: 10
});
const tests = [
  { headers: { 'Content-Type': 'application/json', 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcWpmb3N4bmV1eW95dXpoZGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDI2OTIsImV4cCI6MjA4NzUxODY5Mn0.mPvlN_JEov6cxCXjMlARrzd5zyFHPH131whlB1cQClA' } },
  { headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcWpmb3N4bmV1eW95dXpoZGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDI2OTIsImV4cCI6MjA4NzUxODY5Mn0.mPvlN_JEov6cxCXjMlARrzd5zyFHPH131whlB1cQClA' } },
  { headers: { 'Content-Type': 'application/json', 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcWpmb3N4bmV1eW95dXpoZGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDI2OTIsImV4cCI6MjA4NzUxODY5Mn0.mPvlN_JEov6cxCXjMlARrzd5zyFHPH131whlB1cQClA', 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcWpmb3N4bmV1eW95dXpoZGlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDI2OTIsImV4cCI6MjA4NzUxODY5Mn0.mPvlN_JEov6cxCXjMlARrzd5zyFHPH131whlB1cQClA' } }
];

tests.forEach((test, index) => {
  const options = {
    hostname: 'bcqjfosxneuyoyuzhdiq.supabase.co',
    path: '/functions/v1/create-exam',
    method: 'POST',
    headers: Object.assign({ 'Content-Length': Buffer.byteLength(data) }, test.headers),
  };
  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk.toString(); });
    res.on('end', () => {
      console.log('----- TEST', index+1, '-----');
      console.log('STATUS', res.statusCode);
      console.log(body);
    });
  });
  req.on('error', (err) => { console.error('ERROR', err); });
  req.write(data);
  req.end();
});
