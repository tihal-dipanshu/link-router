// UM‑Dearborn Link Router — S3-deployable chat UI
(function(){
  'use strict';

  const el = {
    messages: document.getElementById('messages'),
    typing: document.getElementById('typing'),
    form: document.getElementById('composer'),
    input: document.getElementById('input'),
    chips: document.getElementById('chips')
  };

  const state = {
    apiUrl: localStorage.getItem('apiUrl') || '',
    sessionId: localStorage.getItem('sessionId') || (self.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())),
    sending: false
  };
  localStorage.setItem('sessionId', state.sessionId);

  // Quick intent chips tailored to campus scenarios
  const suggestions = [
    {q:'parking permit', label:'Parking Permit'},
    {q:'order official transcript', label:'Order Transcript'},
    {q:'reset Canvas password', label:'Canvas Password'},
    {q:'library hours', label:'Library Hours'},
    {q:'financial aid forms', label:'Financial Aid'},
  ];
  suggestions.forEach(s=>{
    const b = document.createElement('button');
    b.textContent = s.label;
    b.addEventListener('click', ()=> send(s.q));
    el.chips.appendChild(b);
  });

  // Welcome message
  botSay("Welcome! Ask for the page you need & I'll return the official UM‑Dearborn link. Try the shortcuts above to start.");

  // Form handling
  el.form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const q = el.input.value.trim();
    if(!q) return;
    send(q);
  });

  el.input.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      el.form.requestSubmit();
    }
  });

  function scrollToBottom(){ el.messages.scrollTop = el.messages.scrollHeight; }

  function userSay(text){
    const row = document.createElement('div');
    row.className = 'row me';
    row.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
    el.messages.appendChild(row);
    scrollToBottom();
  }

  function botSay(text){
    const row = document.createElement('div');
    row.className = 'row';
    const html = renderMarkdownish(text);
    row.innerHTML = `<div class="bubble">${html}</div>`;
    el.messages.appendChild(row);
    scrollToBottom();
  }

  function showTyping(show){ el.typing.classList.toggle('hidden', !show); scrollToBottom(); }

  function toast(msg){
    // simple inline toast in message stream
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="meta">${escapeHtml(msg)}</div>`;
    el.messages.appendChild(row);
    scrollToBottom();
  }

  async function send(q){
    if(state.sending) return;
    state.sending = true;
    userSay(q);
    el.input.value = '';
    showTyping(true);
    try{
      const r = await fetch(state.apiUrl, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ q, sessionId: state.sessionId })
      });
      if(!r.ok){
        throw new Error('HTTP '+r.status);
      }
      const data = await r.json();
      const messages = (data.messages || data.results || []);
      if(Array.isArray(messages) && messages.length){
        messages.forEach(m => botSay(m.text || m.content || String(m)));
      }else if(data.body){ // some Lambdas wrap body as string
        try{
          const body = JSON.parse(data.body);
          (body.messages || []).forEach(m => botSay(m.text || m.content || String(m)));
        }catch(_){
          botSay(String(data.body));
        }
      }else{
        botSay("I’m here. Your backend replied but I couldn’t read the message shape.");
      }
    }catch(err){
      botSay("Hmm, I couldn't get the response. Please try again later.");
      console.error(err);
    }finally{
      showTyping(false);
      state.sending = false;
    }
  }

  // Utilities
  function escapeHtml(s){
    return s.replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
    }[ch]));
  }
  function renderMarkdownish(s){
    // links [text](url)
    let html = escapeHtml(String(s));
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // bullets
    html = html.replace(/(^|\n)[*-]\s+/g, '<br>• ');
    return html;
  }
})();