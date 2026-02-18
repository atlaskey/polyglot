const path = require('path');
const express = require('express');
const webdav = require('./webdav.js');
const websocket = require('./websocket.js');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json({limit:'50mb'}));
app.use(express.urlencoded({limit:'50mb',extended:true}));
app.use(express.static(path.join(__dirname, 'www')));

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

require('dotenv').config();
var wd = new webdav(process.env);

var ws = new websocket(server, localPath => {
  const remotePath = '/polyglot-2026/'+path.basename(localPath);
  wd.uploadFile(localPath,remotePath);
});

(async () => {
  var x = await wd.list('/polyglot-2026');
  if(!x.connected) return console.log('Webdav connection error: '+x.error);
  for(var e of x.data) if(!e.isDirectory) {
    await wd.downloadFile(e.href, path.join(__dirname,'userdata',e.name));
  }
})();
