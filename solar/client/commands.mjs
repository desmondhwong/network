// Machine-authored Codex/OpenAI. Search the actual controls; actions share their existing handlers.
export const normalizeCommand = text => String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function searchCommands(commands, query, limit = 40) {
  const needle = normalizeCommand(query), words = needle.split(' ').filter(Boolean);
  return commands.map((command, index) => {
    const title = normalizeCommand(command.title), haystack = normalizeCommand(`${command.title} ${command.keywords ?? ''} ${command.section ?? ''}`);
    if (!words.every(word => haystack.includes(word))) return null;
    const score = (title === needle ? 1000 : title.startsWith(needle) && needle ? 300 : 0)
      + words.reduce((sum, word) => sum + (title.split(' ').includes(word) ? 20 : title.includes(word) ? 10 : 0), 0)
      + (command.priority ?? 0) - (command.disabled ? 3 : 0);
    return {command, score, index};
  }).filter(Boolean).sort((a,b) => b.score-a.score || a.index-b.index).slice(0,limit).map(row => row.command);
}

function labelFor(control, root) {
  const label = control.closest('label') ?? (control.id ? root.querySelector(`label[for="${control.id}"]`) : null);
  const copy = label?.cloneNode(true);
  copy?.querySelectorAll('input,select,button,output').forEach(node => node.remove());
  return (control.getAttribute('aria-label') ?? copy?.textContent ?? control.textContent ?? control.id).replace(/\s+/g,' ').trim();
}

export function controlCommands(root, {reveal, report = () => {}}) {
  const result = [];
  for (const section of root.querySelectorAll('details[id]')) {
    const title = section.querySelector('summary')?.textContent.trim();
    if (title) result.push({id:`section:${section.id}`, title:`Open ${title} panel`, section:'Panels', priority:15, keywords:'show settings menu controls', run:()=>reveal(section)});
  }
  for (const control of root.querySelectorAll('input[id],select[id],button[id]')) {
    if (control.closest('#command-dialog') || control.type === 'file' || control.type === 'hidden') continue;
    const label = labelFor(control, root);
    if (!label) continue;
    const section = control.closest('details')?.querySelector('summary')?.textContent.trim() ?? 'Controls';
    const disabled = !!control.disabled, blocked = () => report(`${label} is unavailable in the current view. Open its panel to see the context.`);
    result.push({id:`reveal:${control.id}`, title:`Find ${label}`, section, keywords:`show highlight setting ${control.id}`, run:()=>reveal(control)});
    if (control.type === 'checkbox') {
      const subject = label.replace(/^(show|hide|enable|disable)\s+/i,'');
      for (const checked of [true,false]) result.push({id:`set:${control.id}:${checked}`, title:`${checked?'Show':'Hide'} ${subject}`, section, disabled,
        keywords:`${checked?'enable on':'disable off'} toggle ${control.id}`, priority:5,
        run:()=>{if(disabled)return blocked();control.checked=checked;control.dispatchEvent(new (control.ownerDocument.defaultView.Event)('change',{bubbles:true}));report(`${subject} ${checked?'on':'off'}.`);}});
      result.push({id:`toggle:${control.id}`, title:`Toggle ${subject}`, section, disabled, keywords:control.id,
        run:()=>{if(disabled)return blocked();control.checked=!control.checked;control.dispatchEvent(new (control.ownerDocument.defaultView.Event)('change',{bubbles:true}));}});
    } else if (control.tagName === 'BUTTON') {
      result.push({id:`action:${control.id}`, title:label, section, disabled, keywords:control.id,
        run:()=>{if(disabled)return blocked();control.click();}});
    } else if (control.tagName === 'SELECT' && control.options.length <= 35) {
      for (const option of control.options) result.push({id:`option:${control.id}:${option.value}`, title:`${label}: ${option.textContent.trim()}`, section,
        disabled:disabled||option.disabled, keywords:`set select ${control.id}`, run:()=>{if(disabled||option.disabled)return blocked();control.value=option.value;control.dispatchEvent(new (control.ownerDocument.defaultView.Event)('change',{bubbles:true}));}});
    }
  }
  return result;
}

export function mountCommandMenu({dialog, input, list, count, getCommands, beforeOpen=()=>{}}) {
  let commands=[], matches=[], selected=0, returnFocus=null;
  const draw=()=>{
    matches=searchCommands(commands,input.value);selected=Math.min(selected,Math.max(0,matches.length-1));list.replaceChildren();
    matches.forEach((command,index)=>{
      const button=document.createElement('button');button.type='button';button.id=`command-result-${index}`;button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(index===selected));button.setAttribute('aria-disabled',String(!!command.disabled));
      button.className='command-result';button.tabIndex=-1;
      const title=document.createElement('span');title.textContent=command.title;button.appendChild(title);
      const hint=document.createElement('small');hint.textContent=`${command.section??''}${command.disabled?' · unavailable here':''}`;button.appendChild(hint);
      button.onclick=()=>execute(index);list.appendChild(button);
    });
    if(matches.length)input.setAttribute('aria-activedescendant',`command-result-${selected}`);else input.removeAttribute('aria-activedescendant');
    count.textContent=matches.length?`${matches.length} suggestions · ↑ ↓ to choose · Enter to run · Escape to close`:'No matching commands. Try a body, panel or setting name.';
    list.children[selected]?.scrollIntoView?.({block:'nearest'});
  };
  const close=()=>{dialog.close();returnFocus?.focus?.({preventScroll:true});};
  const execute=index=>{const command=matches[index];if(!command)return;close();command.run();};
  const open=()=>{if(dialog.open){input.focus();return;}returnFocus=document.activeElement;beforeOpen();commands=getCommands();input.value='';selected=0;dialog.showModal();draw();input.focus();};
  input.addEventListener('input',()=>{selected=0;draw();});
  input.addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      if(event.key==='Enter')execute(selected);
      else {selected=event.key==='Home'?0:event.key==='End'?matches.length-1:Math.max(0,Math.min(matches.length-1,selected+(event.key==='ArrowDown'?1:-1)));draw();}
    }
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  const shortcut=event=>{if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='k'){event.preventDefault();event.stopPropagation();if(!event.repeat)open();}};
  document.addEventListener('keydown',shortcut,true);
  return {open,close,refresh:()=>{commands=getCommands();draw();},destroy:()=>document.removeEventListener('keydown',shortcut,true)};
}
