const fs = require('fs');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.urlencoded({limit:'50mb',extended:true}));
app.use(express.json({limit:'50mb'}));
app.use(express.static(path.join(__dirname, 'www')));

app.get('/userdata/:md5/:file', (req,res) => {
  var x = { login: 'master', md5: req.params.md5 };
  if(!W.login(0,x)) return res.json({});
  const dir = path.join(__dirname, 'userdata');
  const file = path.join(dir,req.params.file);
  if(req.params.file == 'dir') return res.json(fs.readdirSync(dir));
  if(fs.existsSync(file)) return res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
  res.json({});
});

app.post('/userdata/:md5/:file',(req,res)=> {
  var x = { login: 'master', md5: req.params.md5 };
  if(!W.login(0,x)) return res.json({});
  const dir = path.join(__dirname, 'userdata');
  const file = path.join(dir,req.params.file);
  fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf-8');
  res.json({ upload: file }); 
});

app.post('/data/:md5/:file',(req,res)=> {
  var x = { login: 'master', md5: req.params.md5 };
  if(!W.login(0,x)) return res.json({});
  const dir = path.join(__dirname, 'www','data');
  const file = path.join(dir,req.params.file);
  fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf-8');
  res.json({ upload: file }); 
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

class my_websocket {
  clients = []
  
  constructor() {
    this.init();
  }
  
  init() {
    this.clients = [];
    
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', ws => {
      this.clients.push(ws);

      ws.on('close', () => {
        this.clients.splice(this.clients.indexOf(ws),1);
      });

      ws.on('message', msg => {
        let x;
        try { x = JSON.parse(msg); } catch (e) { return; }
    
        if (x.ping) return this.ping(ws);
        if (x.login) return this.login(ws,x);
        if (x.signin) return this.signin(ws,x);
        if (x.reset && x.username) return this.reset(ws,x);
        if (x.statsUpdate && x.username && x.data) return this.statsUpdate(x);
        if (x.statsLoad && x.username) return this.statsLoad(ws,x);
      });
    });
  }
  
  readUsers() {
    var USERS_FILE = this.statsFile();
    if (!fs.existsSync(USERS_FILE)) return {};
    try {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Error reading users.json:', err);
      return {};
    }
  }
  
  writeUsers(users) {
    try {
      var USERS_FILE = this.statsFile();
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error writing users.json:', err);
    }
  }
  
  ping(ws) {
    this.ws_send(ws, { pong: 2 });
  }
  
  login(ws,x) {
    let users = this.readUsers();

    if (!users[x.login]) {
      if(ws) this.ws_send(ws, { login: false, error: 'User does not exist' });
      return false;
    }

    if (users[x.login] !== x.md5) {
      if(ws) this.ws_send(ws, { login: false, error: 'Incorrect password' });
      return false;
    }

    if(ws) this.ws_send(ws, { login: true, username: x.login, message: `Welcome back, ${x.login}!` });
    return true
  }
  
  signin(ws,x) {
    let users = this.readUsers();

    if (users[x.signin]) {
      this.ws_send(ws, { signin: false, error: 'Username already taken' });
      return;
    }

    users[x.signin] = x.md5;
    this.writeUsers(users);

    this.ws_send(ws, { signin: true, username: x.signin, message: `Account created: ${x.signin}` });
  }
  
  statsFile(username) {
    const dir = path.join(__dirname, 'userdata');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if(username) return path.join(dir, `stats_${username}.json`);
    return path.join(dir, `users.json`);
  }
  
  reset(ws,x) {
    const statsFile = this.statsFile(x.username);
      
    try {
      fs.writeFileSync(statsFile, JSON.stringify({}, null, 2), 'utf-8');
      this.ws_send(ws, { resetDone: true, message: 'Progress has been reset on server.' });
    } catch (err) {
      this.ws_send(ws, { resetDone: false, message: 'Failed to reset progress: ' + err.message });
    }
  }
  
  statsUpdate(x) {
    const statsFile = this.statsFile(x.username);

    let userStats = {};
    if (fs.existsSync(statsFile)) {
      try { userStats = JSON.parse(fs.readFileSync(statsFile, 'utf-8')); } catch {}
    }
    
    if (!userStats[x.data.lang]) userStats[x.data.lang] = {};
    if (!userStats[x.data.lang][x.data.level]) userStats[x.data.lang][x.data.level] = '';
    
    let learnedIds = this.decodeIds(userStats[x.data.lang][x.data.level]);
    if (x.data.learned) {
      if (!learnedIds.includes(x.data.id)) learnedIds.push(x.data.id);
    } else {
      learnedIds = learnedIds.filter(id => id !== x.data.id);
    }
    
    userStats[x.data.lang][x.data.level] = this.encodeIds(learnedIds);
    
    fs.writeFileSync(statsFile, JSON.stringify(userStats, null, 2), 'utf-8');
  }
  
  statsLoad(ws,x) {
    const statsFile = this.statsFile(x.username);
    
    let userStats = {};
    if (fs.existsSync(statsFile)) {
      try {
        userStats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
      } catch {}
    }
      
    this.ws_send(ws, { statsLoad: true, data: userStats });
  }
  
  encodeIds(ids) {
    if (!ids.length) return '';
    ids.sort((a,b) => a-b);
    const ranges = [];
    let start = ids[0], end = ids[0];
  
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] === end + 1) {
        end = ids[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = end = ids[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(',');
  }
  
  decodeIds(str) {
    if (!str) return [];
    const result = [];
    const parts = str.split(',');
    for (const part of parts) {
      if (part.includes('-')) {
        const [a,b] = part.split('-').map(Number);
        for (let i = a; i <= b; i++) result.push(i);
      } else {
        result.push(Number(part));
      }
    }
    return result;
  }
  
  ws_send(ws,data) {
   if (ws && ws.readyState == 1) ws.send(JSON.stringify(data))
  }
}

var W = new my_websocket();
