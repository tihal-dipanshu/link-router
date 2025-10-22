
(function(){
  'use strict';

  const el = {
    messages: document.getElementById('messages'),
    typing: document.getElementById('typing'),
    form: document.getElementById('composer'),
    input: document.getElementById('input'),
    chips: document.getElementById('chips')
  };

  // Default API; user can override via localStorage if you added a settings UI
  const API_URL = "https://jp8o7k9m1c.execute-api.us-east-2.amazonaws.com/chat";

  const state = {
    apiUrl: localStorage.getItem('apiUrl') || API_URL,
    sessionId: localStorage.getItem('sessionId') || (self.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())),
    sending: false
  };
  localStorage.setItem('sessionId', state.sessionId);

  // Quick intent chips tailored to campus scenarios
  // const suggestions = [
  //   {q:'parking permit', label:'Parking Permit'},
  //   {q:'order official transcript', label:'Order Transcript'},
  //   {q:'reset Canvas password', label:'Canvas Password'},
  //   // {q:'library hours', label:'Library Hours'},
  //   // {q:'financial aid forms', label:'Financial Aid'},
  // ];
  const suggestions = [
    { q: 'parking permit',                label: 'Parking Permit' },
    { q: 'order official transcript',     label: 'Order Transcript' },
    { q: 'reset Canvas password',         label: 'Canvas Password' },
  
    { q: 'course registration',           label: 'Course Registration' },
    { q: 'financial aid fafsa',           label: 'FAFSA & Financial Aid' },
    { q: 'advising appointment',          label: 'Academic Advising' },
    { q: 'shuttle schedule',              label: 'Shuttle Schedule' },
    // { q: 'dining options',                label: 'Dining Options' },
    // { q: 'library hours',                 label: 'Library Hours' },
    { q: 'career services handshake',     label: 'Career & Handshake' },
    { q: 'tuition payment',               label: 'Tuition Payment' },
    { q: 'campus events today',           label: 'Campus Events' },
    { q: 'counseling support',            label: 'Counseling Support' },
    // { q: 'mcard replacement',             label: 'ID Card (Mcard)' },
    { q: 'emergency contacts',            label: 'Emergency Contacts' },
    // { q: 'canvas help',                   label: 'Canvas Help' },
    // { q: 'wifi setup',                    label: 'Wi-Fi Setup' },
    // { q: 'registrar forms',               label: 'Registrar Forms' },
  ];
  
  suggestions.forEach(s=>{
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = s.label;
    b.addEventListener('click', ()=> send(s.q));
    el.chips.appendChild(b);
  });

  // Welcome message
  botSay("Welcome! Ask for the page you need and I’ll return the official UM-Dearborn link. Try the shortcuts above to start.");

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
    row.appendChild(bubble(renderText(text)));
    el.messages.appendChild(row);
    scrollToBottom();
  }

  function botSay(text){
    const row = document.createElement('div');
    row.className = 'row';
    // If it looks like a markdown list of campus links, render as link cards
    const parsed = tryParseLinkList(text);
    if(parsed){
      row.appendChild(renderLinkCards(parsed));
    } else {
      row.appendChild(bubble(renderMarkdownish(text)));
    }
    el.messages.appendChild(row);
    scrollToBottom();
  }

  function bubble(innerHTML){
    const d = document.createElement('div');
    d.className = 'bubble';
    d.innerHTML = innerHTML;
    return d;
  }

  function showTyping(show){ el.typing.classList.toggle('hidden', !show); scrollToBottom(); }

  async function send(q){
    if(state.sending) return;
    state.sending = true;
    userSay(q);
    el.input.value = '';
    showTyping(true);

    try{
      const r = await fetch(state.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ q, sessionId: state.sessionId })
      });
      if(!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);

      const data = await r.json();

      const messages = (data.messages || data.results || []);
      if(Array.isArray(messages) && messages.length){
        messages.forEach(m => botSay(m.text || m.content || String(m)));
      }else if(data.body){ // some Lambdas wrap body as a JSON string
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
      console.error('Chat error:', err);
      botSay(`Error: ${escapeHtml(err.message)}. Please try again later.`);
    }finally{
      showTyping(false);
      state.sending = false;
    }
  }

  // ---------- Rendering helpers ----------

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
    }[ch]));
  }

  // Simple paragraphs for user bubbles
  function renderText(s){
    return escapeHtml(String(s)).replace(/\n{2,}/g, '</p><p>').replace(/\n/g,'<br>');
  }

  // Markdown-lite for bot text (non-list)
  function renderMarkdownish(s){
    let html = escapeHtml(String(s));
    // links [text](url)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="link" href="$2" target="_blank" rel="noopener">$1</a>');
    // emphasize dashes as bullets (fallback)
    html = html.replace(/(^|\n)[*-]\s+/g, '<br>• ');
    // paragraphs
    html = html.replace(/\n{2,}/g, '</p><p>').replace(/\n/g,'<br>');
    return `<p>${html}</p>`;
  }

  // Detect and parse a block like:
  // "Title:\n- [Text](URL) — Description\n- [Text](URL) — Description\n\nNeed anything else?"
  function tryParseLinkList(text){
    if(!text || typeof text !== 'string') return null;

    // Split into lines and keep those that start with - or *
    const lines = text.split('\n');
    const items = [];

    for(const line of lines){
      const m = line.match(/^[*-]\s+\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*[—-]\s*(.+)$/i);
      if(m){
        items.push({ title: m[1].trim(), url: m[2].trim(), desc: m[3].trim() });
      }
    }
    if(items.length === 0) return null;

    // Optional heading (first non-bullet line)
    const heading = lines.find(l => l && !l.trim().startsWith('-') && !l.trim().startsWith('*')) || '';
    // Optional footer prompt (last line w/out bullet)
    const tail = lines.reverse().find(l => l && !l.trim().startsWith('-') && !l.trim().startsWith('*')) || '';

    return { heading: heading.trim(), items, tail: tail.trim() };
  }

  // Render pretty link list as cards
  function renderLinkCards({heading, items, tail}){
    const wrap = document.createElement('div');

    if(heading){
      const h = document.createElement('div');
      h.className = 'list-heading';
      h.textContent = heading.replace(/[:：]\s*$/, '');
      wrap.appendChild(h);
    }

    const ul = document.createElement('ul');
    ul.className = 'link-list';
    for(const it of items){
      const li = document.createElement('li');
      li.className = 'link-item';

      const a = document.createElement('a');
      a.className = 'link-primary';
      a.href = it.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = it.title;

      const meta = document.createElement('div');
      meta.className = 'link-desc';
      meta.textContent = it.desc;

      li.appendChild(a);
      li.appendChild(meta);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);

    if(tail && !/^\s*Official/i.test(tail)){ // avoid duplicating heading lines
      const footer = document.createElement('div');
      footer.className = 'list-tail';
      footer.textContent = tail;
      wrap.appendChild(footer);
    }

    // Put inside a bubble for consistent spacing
    const b = document.createElement('div');
    b.className = 'bubble';
    b.appendChild(wrap);
    return b;
  }

})();



// // UM‑Dearborn Link Router — S3-deployable chat UI
// (function(){
//   'use strict';

//   const el = {
//     messages: document.getElementById('messages'),
//     typing: document.getElementById('typing'),
//     form: document.getElementById('composer'),
//     input: document.getElementById('input'),
//     chips: document.getElementById('chips')
//   };

//   const API_URL = 'https://jp8o7k9m1c.execute-api.us-east-2.amazonaws.com/chat';
  
//   const state = {
//     apiUrl: localStorage.getItem('apiUrl') || API_URL,
//     sessionId: localStorage.getItem('sessionId') || (self.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())),
//     sending: false
//   };
//   localStorage.setItem('sessionId', state.sessionId);

//   // Quick intent chips tailored to campus scenarios
//   const suggestions = [
//     {q:'parking permit', label:'Parking Permit'},
//     {q:'order official transcript', label:'Order Transcript'},
//     {q:'reset Canvas password', label:'Canvas Password'},
//     {q:'library hours', label:'Library Hours'},
//     {q:'financial aid forms', label:'Financial Aid'},
//   ];
//   suggestions.forEach(s=>{
//     const b = document.createElement('button');
//     b.textContent = s.label;
//     b.addEventListener('click', ()=> send(s.q));
//     el.chips.appendChild(b);
//   });

//   // Welcome message
//   botSay("Welcome! Ask for the page you need & I'll return the official UM‑Dearborn link. Try the shortcuts above to start.");

//   // Form handling
//   el.form.addEventListener('submit', (e)=>{
//     e.preventDefault();
//     const q = el.input.value.trim();
//     if(!q) return;
//     send(q);
//   });

//   el.input.addEventListener('keydown', (e)=>{
//     if(e.key === 'Enter' && !e.shiftKey){
//       e.preventDefault();
//       el.form.requestSubmit();
//     }
//   });

//   function scrollToBottom(){ el.messages.scrollTop = el.messages.scrollHeight; }

//   function userSay(text){
//     const row = document.createElement('div');
//     row.className = 'row me';
//     row.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
//     el.messages.appendChild(row);
//     scrollToBottom();
//   }

//   function botSay(text){
//     const row = document.createElement('div');
//     row.className = 'row';
//     const html = renderMarkdownish(text);
//     row.innerHTML = `<div class="bubble">${html}</div>`;
//     el.messages.appendChild(row);
//     scrollToBottom();
//   }

//   function showTyping(show){ el.typing.classList.toggle('hidden', !show); scrollToBottom(); }

//   function toast(msg){
//     // simple inline toast in message stream
//     const row = document.createElement('div');
//     row.className = 'row';
//     row.innerHTML = `<div class="meta">${escapeHtml(msg)}</div>`;
//     el.messages.appendChild(row);
//     scrollToBottom();
//   }

//   async function send(q){
//     if(state.sending) return;
//     state.sending = true;
//     userSay(q);
//     el.input.value = '';
//     showTyping(true);
    
//     // Debug logging
//     console.log('Sending request to:', state.apiUrl);
//     console.log('Request payload:', { q, sessionId: state.sessionId });
    
//     try{
//       const r = await fetch(state.apiUrl, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           'Accept': 'application/json'
//         },
//         body: JSON.stringify({ q, sessionId: state.sessionId })
//       });
      
//       console.log('Response status:', r.status);
//       console.log('Response headers:', Object.fromEntries(r.headers.entries()));
      
//       if(!r.ok){
//         throw new Error(`HTTP ${r.status}: ${r.statusText}`);
//       }
      
//       const data = await r.json();
//       console.log('Response data:', data);
      
//       const messages = (data.messages || data.results || []);
//       if(Array.isArray(messages) && messages.length){
//         messages.forEach(m => botSay(m.text || m.content || String(m)));
//       }else if(data.body){ // some Lambdas wrap body as string
//         try{
//           const body = JSON.parse(data.body);
//           (body.messages || []).forEach(m => botSay(m.text || m.content || String(m)));
//         }catch(_){
//           botSay(String(data.body));
//         }
//       }else{
//         botSay("I'm here. Your backend replied but I couldn't read the message shape.");
//       }
//     }catch(err){
//       console.error('Fetch error:', err);
//       if(err.name === 'TypeError' && err.message.includes('fetch')){
//         botSay("Network error: Unable to connect to the server. Please check your internet connection and try again.");
//       }else if(err.message.includes('CORS')){
//         botSay("CORS error: The server is not allowing requests from this domain. Please contact the administrator.");
//       }else{
//         botSay(`Error: ${err.message}. Please try again later.`);
//       }
//     }finally{
//       showTyping(false);
//       state.sending = false;
//     }
//   }

//   // Utilities
//   function escapeHtml(s){
//     return s.replace(/[&<>"']/g, ch => ({
//       '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
//     }[ch]));
//   }
//   function renderMarkdownish(s){
//     // links [text](url)
//     let html = escapeHtml(String(s));
//     html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
//     // bullets
//     html = html.replace(/(^|\n)[*-]\s+/g, '<br>• ');
//     return html;
//   }
// })();