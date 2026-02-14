const fs = require('fs');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'www')));

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const wss = new WebSocketServer({ server });

var clients = [];

wss.on('connection', (ws) => {
  clients.push(ws);
  
  ws.on('close', () => {
    clients.splice(clients.indexOf(ws),1);
  });
  
  ws.on('message', msg => {
    let x;
    try { x = JSON.parse(msg); } catch (e) { return; }

    const dataDir = path.join(__dirname, 'userdata');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    if (x.ping) {
      ws_send(ws, { pong: 2 });
      return;
    }

    if (x.login) {
      let users = readUsers();

      if (!users[x.login]) {
        ws_send(ws, { login: false, error: 'User does not exist' });
        return;
      }

      if (users[x.login] !== x.md5) {
        ws_send(ws, { login: false, error: 'Incorrect password' });
        return;
      }

      ws_send(ws, { login: true, username: x.login, message: `Welcome back, ${x.login}!` });
      return;
    }
    
    if (x.signin) {
      let users = readUsers();

      if (users[x.signin]) {
        ws_send(ws, { signin: false, error: 'Username already taken' });
        return;
      }

      users[x.signin] = x.md5;
      writeUsers(users);

      ws_send(ws, { signin: true, username: x.signin, message: `Account created: ${x.signin}` });
      return;
    }
    
    if (x.reset && x.username) {
      const dataDir = path.join(__dirname, 'userdata');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      
      const statsFile = path.join(dataDir, `stats_${x.username}.json`);
      
      try {
        fs.writeFileSync(statsFile, JSON.stringify({}, null, 2), 'utf-8');
        ws_send(ws, { resetDone: true, message: 'Progress has been reset on server.' });
      } catch (err) {
        ws_send(ws, { resetDone: false, message: 'Failed to reset progress: ' + err.message });
      }
    }
    
    if (x.statsUpdate && x.username && x.data) {
      const statsFile = path.join(dataDir, `stats_${x.username}.json`);
      let userStats = {};
      if (fs.existsSync(statsFile)) {
        try { userStats = JSON.parse(fs.readFileSync(statsFile, 'utf-8')); } catch {}
      }
    
      if (!userStats[x.data.lang]) userStats[x.data.lang] = {};
      if (!userStats[x.data.lang][x.data.level]) userStats[x.data.lang][x.data.level] = '';
    
      let learnedIds = decodeIds(userStats[x.data.lang][x.data.level]);
      if (x.data.learned) {
        if (!learnedIds.includes(x.data.id)) learnedIds.push(x.data.id);
      } else {
        learnedIds = learnedIds.filter(id => id !== x.data.id);
      }
    
      userStats[x.data.lang][x.data.level] = encodeIds(learnedIds);
    
      fs.writeFileSync(statsFile, JSON.stringify(userStats), 'utf-8');
      return;
    }

    if (x.statsLoad && x.username) {
      const statsFile = path.join(dataDir, `stats_${x.username}.json`);
    
      let userStats = {};
      if (fs.existsSync(statsFile)) {
        try {
          userStats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
        } catch {}
      }
      
      ws_send(ws, { statsLoad: true, data: userStats });
    }
  });
});

function ws_send(ws,data) {
   if (ws && ws.readyState == 1) ws.send(JSON.stringify(data))
}

function encodeIds(ids) {
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

function decodeIds(str) {
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

const USERS_FILE = path.join(__dirname, 'users.json');

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading users.json:', err);
    return {};
  }
}

function writeUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing users.json:', err);
  }
}