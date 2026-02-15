class page {  
  currentData = []
  studyLang = "en"
  currentLevel = 1000
  currentTestItem =  null
  isPlaying = false
  isPaused = false
  playQueue = []
  testQueue = []
  currentIndex = 0
  playTimer = null
  recognition = null
  isRecording = false
  isConnected = false
  
  async setLevel(value, element) {
    this.currentLevel = value;
    const buttons = document.querySelectorAll('#levelGroup .btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (element) element.classList.add('active');

    const filePath = `/data/${this.studyLang}_${value}.json`;

    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error('Network response was not ok');
        
        this.currentData = await response.json();
        this.currentData.forEach(item => {
            const saved = localStorage.getItem(`${this.studyLang}_${value}_${item.id}`);
            if (saved !== null) item.learned = (saved === 'true');
        });
        
        this.renderTable();
    } catch (e) {
        console.error("Error loading level:", e);
        document.getElementById('vocabBody').innerHTML = '<tr><td colspan="5" class="text-center">Error loading data.</td></tr>';
    }
  }
  
  reloadCurrentLevel(value) {
    this.studyLang = value;
    const activeBtn = document.querySelector('#levelGroup .btn.active');
    this.setLevel(this.currentLevel, activeBtn);
  }
  
  renderTable(nativeLang) {
    if(nativeLang) this.nativeLang = nativeLang;

    const tbody = document.getElementById('vocabBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    this.currentData.forEach((item, index) => {
      const translation = item.translations[this.nativeLang] || "—";
      const row = `
          <tr class="${item.learned ? 'table-light opacity-50' : ''}">
              <th scope="row">${index + 1}</th>
              <td>
                  <div class="d-flex align-items-center">
                      <button class="btn btn-link btn-sm p-0 me-2 text-primary border-0" 
                              onclick="P.speak('${item.word.replace(/'/g, "\\'")}')">
                          <span class="material-symbols-outlined fs-5">volume_up</span>
                      </button>
                      <span>${item.word}</span>
                  </div>
              </td>
              <td class="text-muted small phonetic">${item.transcription}</td>
              <td>${translation}</td>
              <td class="text-center">
                  <div class="form-check form-switch d-inline-block">
                      <input class="form-check-input" type="checkbox" role="switch" 
                             onchange="P.toggleLearned(${item.id}, this.checked)"
                             id="word${item.id}" ${item.learned ? 'checked' : ''}>
                  </div>
              </td>
          </tr>`;
      tbody.insertAdjacentHTML('beforeend', row);
    });
    this.updateProgress();
  }
  
  toggleLearned(id, isChecked) {
    const item = this.currentData.find(i => i.id === id);
    if (item) {
        item.learned = isChecked;
        localStorage.setItem(`${this.studyLang}_${this.currentLevel}_${id}`, isChecked);
        if (this.username) {
          W.ws_send({
            statsUpdate: true,
            username: this.username,
            data: {
              id,
              learned: isChecked,
              level: this.currentLevel,
              lang: this.studyLang
            }
          });
        }
    }
    this.renderTable();
  }
  
  speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.studyLang === 'en' ? 'en-US' : 'de-DE';
    window.speechSynthesis.speak(utterance);
  }
  
  startPlay() {
    this.playQueue = this.currentData.filter(item => !item.learned);
    if (this.playQueue.length === 0) this.alert("Information","All learned!");
    else {
      this.isPlaying = true;
      this.isPaused = false;
      this.currentIndex = 0;
      new bootstrap.Modal(document.getElementById('playModal')).show();
      this.playNext();
    }
  }
  
  async playNext() {
    if (!this.isPlaying || this.isPaused || this.playQueue.length === 0) return;
    const item = this.playQueue[this.currentIndex];

    const regex = new RegExp(`(${item.word})`, 'gi');
    document.getElementById('playSentence').innerHTML = item.sentence.text.replace(regex, '<span class="highlight-word">$1</span>');
    document.getElementById('playTranslation').innerText = item.sentence.translations[this.nativeLang];

    document.getElementById('markLearnedBtn').onclick = () => {
        if (this.playTimer) clearTimeout(this.playTimer);
        item.learned = true;
        this.playQueue.splice(this.currentIndex, 1);
        this.renderTable();
        if (this.playQueue.length === 0) { this.stopPlay(); } 
        else { if (this.currentIndex >= this.playQueue.length) this.currentIndex = 0; this.playNext(); }
    };

    this.speak(item.sentence.text);
    if (this.playTimer) clearTimeout(this.playTimer);
    this.playTimer = setTimeout(() => {
      if (this.isPlaying && !this.isPaused) {
        this.currentIndex = (this.currentIndex + 1) % this.playQueue.length;
        this.playNext();
      }
    }, 6000);
  }
  
  togglePause() {
      this.isPaused = !this.isPaused;
      document.getElementById('pauseIcon').innerText = this.isPaused ? 'play_arrow' : 'pause';
      if (!this.isPaused) this.playNext();
  }
  
  startTest() {
    this.testQueue = this.currentData.filter(item => !item.learned);
    if (this.testQueue.length === 0) this.alert("Information","Nothing to test!");
    else {
      new bootstrap.Modal(document.getElementById('testModal')).show();
      this.testNext();
    }
  }
  
  testNext() {
    if (this.testQueue.length === 0) return this.stopTest();
    this.currentTestItem = this.testQueue[Math.floor(Math.random() * this.testQueue.length)];
    const nativeLang = document.getElementById('nativeLang').value;
    const regex = new RegExp(`(${this.currentTestItem.word})`, 'gi');
    document.getElementById('testSentence').innerHTML = this.currentTestItem.sentence.text.replace(regex, '<span class="highlight-word">$1</span>');
    document.getElementById('testTranslation').innerText = this.currentTestItem.sentence.translations[nativeLang];
    document.getElementById('liveTranscript').innerText = '';
    document.getElementById('recordingStatus').innerText = 'Microphone off';
    document.getElementById('recordingStatus').className = 'text-muted';
    this.speak(this.currentTestItem.sentence.text);
  }
  
  toggleRecord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!this.recognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.onresult = (e) => {
          let text = '';
          for (let i = e.resultIndex; i < e.results.length; ++i) text += e.results[i][0].transcript;
          document.getElementById('liveTranscript').innerText = text;
      };
    }

    if (!this.isRecording) {
      this.recognition.lang = this.studyLang === 'en' ? 'en-US' : 'de-DE';
      this.recognition.start();
      this.isRecording = true;
      document.getElementById('recordingStatus').innerText = 'Listening...';
      this.updateRecordUI(true);
    } else {
      this.recognition.stop();
      this.isRecording = false;
      this.updateRecordUI(false);
      setTimeout(() => this.validateSpeech(), 400);
    }
  }
  
  validateSpeech() {
    const transcript = document.getElementById('liveTranscript').innerText;
    if (!transcript || !this.currentTestItem) return;
    
    const original = this.normalizeText(this.currentTestItem.sentence.text);
    const spoken = this.normalizeText(transcript);
    const statusEl = document.getElementById('recordingStatus');

    if (original === spoken) {
        statusEl.innerText = "✓ Correct!";
        statusEl.className = "text-success fw-bold";
        this.currentTestItem.learned = true;
        const indexToRemove = this.testQueue.findIndex(item => item.id === this.currentTestItem.id);
        if (indexToRemove !== -1) {
            this.testQueue.splice(indexToRemove, 1);
        }
        this.renderTable();
        if (this.testQueue.length === 0) {
          setTimeout(() => {
            this.alert("Information","Congratulations! You've mastered all words in this level.");
            this.stopTest();
          }, 500);
        } else {
            setTimeout(() => this.testNext(), 1500);
        }
    } else {
        statusEl.innerText = "✗ Try again!";
        statusEl.className = "text-danger fw-bold";
    }
  }
  
  updateRecordUI(active) {
    const btn = document.getElementById('recordBtn');
    btn.className = active ? 'btn btn-success' : 'btn btn-danger';
    btn.innerHTML = active ? 'Stop recording' : 'Record';
  }
  
  updateProgress() {
    if (!this.currentData || this.currentData.length === 0) return;
    const total = this.currentData.length;
    const learnedCount = this.currentData.filter(item => item.learned).length;
    const percentage = Math.round((learnedCount / total) * 100);
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressPercent');
    if (bar && text) {
      bar.style.width = percentage + '%';
      bar.setAttribute('aria-valuenow', percentage);
      text.innerText = percentage + '%';
      if (percentage === 100) {
        bar.classList.replace('bg-primary', 'bg-success');
        bar.classList.remove('progress-bar-animated');
      } else {
        bar.classList.replace('bg-success', 'bg-primary');
        if (this.isPlaying) bar.classList.add('progress-bar-animated');
      }
    }
  }
  
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Speech Recognition not supported in this browser.");
      return null;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Show results while speaking
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      document.getElementById('liveTranscript').innerText = transcript;
    };
    recognition.onerror = (event) => {
      console.error("Recognition error:", event.error);
      this.stopRecordingUI();
    };
    return recognition;
  }
  
  normalizeText(text) {
    return text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\?]/g, "").replace(/\s{2,}/g, " ").trim();

    return text
     .toLowerCase()
     .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\?]/g, "")
     .replace(/\s{2,}/g, " ")
     .trim();
  }
  
  stopPlay() {
    this.isPlaying = false;
    clearTimeout(this.playTimer);
    bootstrap.Modal.getInstance(document.getElementById('playModal')).hide()
  }
  
  stopTest() {
    bootstrap.Modal.getInstance(document.getElementById('testModal')).hide()
  }
  
  resetProgress() {
    this.alert("Reset all my progress","Are you sure? This will delete all your learned words and progress across all languages.",() => {
      localStorage.clear();
      this.currentData.forEach(item => item.learned = false);
      this.renderTable();
      if(this.username) W.ws_send({ reset: true, username: this.username });
    });
  }
  
  copyCrypto(name, address) {
    navigator.clipboard.writeText(address).then(() => {
      this.alert("Support the project",`${name} address copied to clipboard! Thank you for your support`)
    }).catch(err => {
      console.error('Could not copy text: ', err);
      prompt(`Copy ${name} address:`, address);
    });
  }

  alert(title,message,ok) {
    const modalElement = document.getElementById('alert');
    const modal = new bootstrap.Modal(modalElement);
    const cancelBtn = document.getElementById('btnCancel');
    if(ok) cancelBtn.style.display = 'block';
    else cancelBtn.style.display = 'none';
    const okBtn = document.getElementById('btnOk');
    $('#alert_title').html(title);
    $('#alert_message').html(message)
    modal.show();
    cancelBtn.onclick = () => { modal.hide() };
    okBtn.onclick = () => { modal.hide(); if(ok) ok() };
  }

  toggleAuthForm(formType, event) {
    event?.preventDefault();
    const loginForm = document.getElementById('loginForm');
    const signInForm = document.getElementById('signInForm');
    const modalTitle = document.getElementById('authModalLabel');
    const authSubmit = document.getElementById('authSubmit');
  
    if (formType === 'login') {
      signInForm.classList.add('d-none');
      loginForm.classList.remove('d-none');
      modalTitle.textContent = 'Login';
      authSubmit.setAttribute('form', 'loginForm');
      authSubmit.textContent = 'Login';
    } else {
      loginForm.classList.add('d-none');
      signInForm.classList.remove('d-none');
      modalTitle.textContent = 'Sign in';
      authSubmit.setAttribute('form', 'signInForm');
      authSubmit.textContent = 'Sign in';
    }
  }

  AuthForm(action, event) {
    event?.preventDefault();
  
    const loginForm = document.getElementById('loginForm');
    const signInForm = document.getElementById('signInForm');
    const modal = bootstrap.Modal.getInstance(document.getElementById('authModal'));
  
    const activeForm = loginForm.classList.contains('d-none') ? signInForm : loginForm;
    const formType = loginForm.classList.contains('d-none') ? 'Sign in' : 'Login';
  
    if (action === 'Cancel') {
      activeForm.reset(); modal.hide();
      return;
    }
  
    if (action === 'OK') {
      const formData = {};
      Array.from(activeForm.querySelectorAll('input')).forEach(input => {
        formData[input.id] = input.value;
      });
  
      if (formType === 'Login') P.login(formData.loginUsername, formData.loginPassword);
      else P.signIn(formData.signInUsername, formData.signInPassword, formData.signInConfirm);
  
      modal.hide();
      activeForm.reset();
    }
  }

  md5(d){
    function M(d){for(var _,m="0123456789ABCDEF",f="",r=0;r<d.length;r++)_=d.charCodeAt(r),f+=m.charAt(_>>>4&15)+m.charAt(15&_);return f}function X(d){for(var _=Array(d.length>>2),m=0;m<_.length;m++)_[m]=0;for(m=0;m<8*d.length;m+=8)_[m>>5]|=(255&d.charCodeAt(m/8))<<m%32;return _}function V(d){for(var _="",m=0;m<32*d.length;m+=8)_+=String.fromCharCode(d[m>>5]>>>m%32&255);return _}function Y(d,_){d[_>>5]|=128<<_%32,d[14+(_+64>>>9<<4)]=_;for(var m=1732584193,f=-271733879,r=-1732584194,i=271733878,n=0;n<d.length;n+=16){var h=m,t=f,g=r,e=i;f=md5_ii(f=md5_ii(f=md5_ii(f=md5_ii(f=md5_hh(f=md5_hh(f=md5_hh(f=md5_hh(f=md5_gg(f=md5_gg(f=md5_gg(f=md5_gg(f=md5_ff(f=md5_ff(f=md5_ff(f=md5_ff(f,r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+0],7,-680876936),f,r,d[n+1],12,-389564586),m,f,d[n+2],17,606105819),i,m,d[n+3],22,-1044525330),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+4],7,-176418897),f,r,d[n+5],12,1200080426),m,f,d[n+6],17,-1473231341),i,m,d[n+7],22,-45705983),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+8],7,1770035416),f,r,d[n+9],12,-1958414417),m,f,d[n+10],17,-42063),i,m,d[n+11],22,-1990404162),r=md5_ff(r,i=md5_ff(i,m=md5_ff(m,f,r,i,d[n+12],7,1804603682),f,r,d[n+13],12,-40341101),m,f,d[n+14],17,-1502002290),i,m,d[n+15],22,1236535329),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+1],5,-165796510),f,r,d[n+6],9,-1069501632),m,f,d[n+11],14,643717713),i,m,d[n+0],20,-373897302),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+5],5,-701558691),f,r,d[n+10],9,38016083),m,f,d[n+15],14,-660478335),i,m,d[n+4],20,-405537848),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+9],5,568446438),f,r,d[n+14],9,-1019803690),m,f,d[n+3],14,-187363961),i,m,d[n+8],20,1163531501),r=md5_gg(r,i=md5_gg(i,m=md5_gg(m,f,r,i,d[n+13],5,-1444681467),f,r,d[n+2],9,-51403784),m,f,d[n+7],14,1735328473),i,m,d[n+12],20,-1926607734),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+5],4,-378558),f,r,d[n+8],11,-2022574463),m,f,d[n+11],16,1839030562),i,m,d[n+14],23,-35309556),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+1],4,-1530992060),f,r,d[n+4],11,1272893353),m,f,d[n+7],16,-155497632),i,m,d[n+10],23,-1094730640),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+13],4,681279174),f,r,d[n+0],11,-358537222),m,f,d[n+3],16,-722521979),i,m,d[n+6],23,76029189),r=md5_hh(r,i=md5_hh(i,m=md5_hh(m,f,r,i,d[n+9],4,-640364487),f,r,d[n+12],11,-421815835),m,f,d[n+15],16,530742520),i,m,d[n+2],23,-995338651),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+0],6,-198630844),f,r,d[n+7],10,1126891415),m,f,d[n+14],15,-1416354905),i,m,d[n+5],21,-57434055),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+12],6,1700485571),f,r,d[n+3],10,-1894986606),m,f,d[n+10],15,-1051523),i,m,d[n+1],21,-2054922799),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+8],6,1873313359),f,r,d[n+15],10,-30611744),m,f,d[n+6],15,-1560198380),i,m,d[n+13],21,1309151649),r=md5_ii(r,i=md5_ii(i,m=md5_ii(m,f,r,i,d[n+4],6,-145523070),f,r,d[n+11],10,-1120210379),m,f,d[n+2],15,718787259),i,m,d[n+9],21,-343485551),m=safe_add(m,h),f=safe_add(f,t),r=safe_add(r,g),i=safe_add(i,e)}return Array(m,f,r,i)}function md5_cmn(d,_,m,f,r,i){return safe_add(bit_rol(safe_add(safe_add(_,d),safe_add(f,i)),r),m)}function md5_ff(d,_,m,f,r,i,n){return md5_cmn(_&m|~_&f,d,_,r,i,n)}function md5_gg(d,_,m,f,r,i,n){return md5_cmn(_&f|m&~f,d,_,r,i,n)}function md5_hh(d,_,m,f,r,i,n){return md5_cmn(_^m^f,d,_,r,i,n)}function md5_ii(d,_,m,f,r,i,n){return md5_cmn(m^(_|~f),d,_,r,i,n)}function safe_add(d,_){var m=(65535&d)+(65535&_);return(d>>16)+(_>>16)+(m>>16)<<16|65535&m}function bit_rol(d,_){return d<<_|d>>>32-_};var r = M(V(Y(X(d),8*d.length)));return r.toLowerCase()
  }

  login(user, password) {
    if (!user) return this.alert('Login Error', 'Username cannot be empty.');
    if (!password) return this.alert('Login Error', 'Password cannot be empty.');
    const md5 = this.md5(password);

    W.ws_send({ login: user, md5 });
  }

  signIn(user, password, c_password) {
    if (!user) return this.alert('Sign In Error', 'Username cannot be empty.');
    if (!/^[A-Za-z]+$/.test(user)) return this.alert('Login Error', 'Username can contain only English letters.');
    if (!password) return this.alert('Sign In Error', 'Password cannot be empty.');
    if (password !== c_password) return this.alert('Sign In Error', 'Passwords do not match.');
    const md5 = this.md5(password);
    W.ws_send({ signin: user, md5 });
  }

  updateAuthButtonState() {
    const btn = document.getElementById('authBtn');
    btn.disabled = !this.isConnected;
  }

  updateAuthButton(username) {
    this.username = username;
    const btn = document.getElementById('authBtn');
    btn.classList.remove('btn-warning');
    btn.classList.add('btn-success');
    btn.innerHTML = `<span class="material-symbols-outlined me-1 fs-6">person</span>${username}`;
    btn.removeAttribute('data-bs-toggle');
    btn.removeAttribute('data-bs-target');
    W.ws_send({ statsLoad: true, username: this.username });
  }
}

P = new page();

window.onload = () => {
  P.nativeLang = document.getElementById('nativeLang').value;
  const firstBtn = document.querySelector('#levelGroup .btn.active');
  P.setLevel(1000, firstBtn);
};

class my_websocket {
  constructor() {
    this.init()
  }

  init() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}//${host}/`);

    this.ws.onopen = () => { this.ws_send({ ping: 1 }) };
    this.ws.onclose = () => { console.log("Connection is closed...") };

    this.ws.onmessage = e => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        return P.alert('Error', 'Received invalid JSON from server.');
      }

      if ('login' in msg) return this.login(msg);
      if ('signin' in msg) return this.signin(msg);
      if ('resetDone' in msg) return this.resetDone(msg);
      if (msg.statsLoad) return this.statsLoad(msg);
      if (msg.pong) {
        P.isConnected = true;
        P.updateAuthButtonState();
        setTimeout(() => {
          P.isConnected = false;
          P.updateAuthButtonState();
          this.ws_send({ ping: 1 })
        }, 10000);
      }
    }
  }

  ws_send(data) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
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

  login(msg) {
    if (msg.login) {
      P.alert('Login Success', msg.message);
      P.updateAuthButton(msg.username)
    } else {
      P.alert('Login Error', msg.error || 'Login failed.');
    }
  }

  signin(msg) {
    if (msg.signin) {
      P.alert('Sign In Success', msg.message);
      P.updateAuthButton(msg.username)
    } else {
      P.alert('Sign In Error', msg.error || 'Sign in failed.');
    }
  }

  resetDone(msg) {
    if (msg.resetDone) P.alert('Progress Reset', msg.message);
    else P.alert('Error', msg.message);
  }

  statsLoad(msg) {
    const data = msg.data;
    
    for (const lang in data) {
      for (const level in data[lang]) {
        const compact = data[lang][level] || '';
        const ids = this.decodeIds(compact);
  
        ids.forEach(id => {
          localStorage.setItem(`${lang}_${level}_${id}`, true);
  
          if (lang === P.studyLang && level === P.currentLevel.toString()) {
            const item = P.currentData.find(i => i.id === id);
            if (item) item.learned = true;
          }
        });
      }
    }
    
    P.renderTable();
  }
}

var W = new my_websocket();