// DNI Operations: one integrated workspace. The API, not this UI, authorizes actions.
const API = '/operations-data.php';
const DEPARTMENTS = [
  ['army','Imperial Army Corps','Ground forces and organized land operations.'],
  ['navy','Imperial Navy Corps','Fleet operations and naval command.'],
  ['security','Imperial Security Bureau','Imperial security and authorized investigations.'],
  ['logistics','Imperial Logistics Corps','Supply, transport, and operational sustainment.'],
  ['engineering','Imperial Engineering Corps','Engineering support, maintenance, and technical operations.']
];
const esc = value => String(value ?? '');
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = esc(value);
    else if (key === 'onClick') node.addEventListener('click', value);
    else if (key === 'onChange') node.addEventListener('change', value);
    else if (key === 'hidden') node.hidden = Boolean(value);
    else if (key === 'disabled') node.disabled = Boolean(value);
    else node.setAttribute(key, esc(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(esc(child)));
  }
  return node;
}
const title = (text, level = 3) => el(`h${level}`, {text});
const paragraph = text => el('p', {text});
const button = (text, handler, extra = {}) => el('button', {type:'button', onClick:event=>{
  try { Promise.resolve(handler(event)).catch(error=>console.warn('Operations action failed:',error.message)); }
  catch(error) { console.warn('Operations action failed:',error.message); }
}, ...extra}, text);
const section = (...children) => el('section', {class:'dni-ops-card'}, ...children);
const details = (label, ...children) => el('details', {class:'dni-ops-details'}, el('summary',{text:label}), ...children);
const badge = text => el('span',{class:'dni-ops-badge',text});
const empty = text => paragraph(text || 'No records are available.');
const formatDate = value => value ? new Date(value.replace(' ','T') + (value.includes('T') ? '' : 'Z')).toLocaleString() : 'Not set';
const labelOf = (rows, id) => rows.find(row => String(row.id) === String(id))?.name || `Member #${id}`;
const field = (label, name, value = '', options = {}) => {
  const wrap = el('label',{class:'dni-ops-field'});
  wrap.append(el('span',{text:label}));
  let input;
  if (options.choices) {
    input = el('select',{name,required:options.required || undefined});
    for (const [value,label] of options.choices) input.append(el('option',{value,text:label}));
    input.value = String(value ?? '');
  } else if (options.type === 'textarea') {
    input = el('textarea',{name,rows:options.rows || 4, maxlength:options.max || 20000,required:options.required || undefined});
    input.value = esc(value);
  } else {
    input = el('input',{name,type:options.type || 'text',value:value ?? '',min:options.min,max:options.max,step:options.step,placeholder:options.placeholder,required:options.required || undefined,maxlength:options.maxlength});
    if (options.type === 'checkbox') { input.checked = Boolean(value); input.value = '1'; }
  }
  wrap.append(input);
  return wrap;
};
const boolValue = (form, name) => Boolean(form.elements[name]?.checked);
const values = form => Object.fromEntries(new FormData(form).entries());
const number = value => value === '' || value === null || value === undefined ? null : Number(value);
const lines = value => esc(value).split(/\r?\n/).map(v => v.trim()).filter(Boolean);
const dateValue = value => value ? String(value).replace(' ','T').slice(0,16) : '';
const eventList = records => records?.length ? el('ol',{class:'dni-ops-history'},records.map(row => el('li',{}, el('time',{text:formatDate(row.created_at)}),' · ',row.event_type,' · ',row.note || 'Status recorded'))) : empty('No activity yet.');

export function mountOperations(panel, shell, tab) {
  const content = panel.querySelector('#dni-operations-content');
  const selector = panel.querySelector('#dni-operations-department');
  const directory = panel.querySelector('.dni-operations-departments');
  const subnav = panel.querySelector('.dni-operations-subnav');
  const notice = el('div',{class:'dni-ops-feedback',role:'status','aria-live':'polite'});
  content.before(notice);
  let session = null, corp = 'army', view = 'overview', generation = 0, busy = false;
    const caps = code => session?.capabilities?.[code] || {};
  const can = (name, code = corp) => caps(code)[name] === true;
  const isb = name => session?.isb?.[name] === true;
  const own = () => session?.user?.corp === corp;
  const label = code => DEPARTMENTS.find(d => d[0] === code)?.[1] || code;
  const setNotice = (text, error = false) => { notice.textContent = text; notice.dataset.error = error ? 'true' : 'false'; };
  function showError(error) { setNotice(error?.message || 'DNI Operations is unavailable.',true); }
  function showTab(authorized) {
    tab.hidden = !authorized;
    tab.setAttribute('aria-hidden',String(!authorized));
    tab.tabIndex = authorized ? 0 : -1;
    if (!authorized) panel.hidden = true;
  }
  async function api(resource, params = {}) {
    const url = new URL(API,location.origin);
    url.searchParams.set('resource',resource);
    for (const [key,value] of Object.entries(params)) if (value !== null && value !== undefined) url.searchParams.set(key,String(value));
    const res = await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok !== true) { const error = new Error(body.error || `Request failed (${res.status}).`); error.status=res.status; throw error; }
    return body;
  }
  async function write(action, data = {}) {
    if (busy) return;
    busy = true;
    setNotice('Saving…');
    try {
      const res = await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json','X-DNI-CSRF':session.csrfToken},body:JSON.stringify({action,requestKey:crypto.randomUUID(),...data})});
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok !== true) throw new Error(body.error || `Save failed (${res.status}).`);
      setNotice('Changes saved.');
      await refresh();
      return body;
    } catch (error) { showError(error); throw error; }
    finally { busy=false; }
  }
  function submitForm(titleText, fields, submit, options = {}) {
    const form = el('form',{class:'dni-ops-form'});
    form.append(title(titleText,4),...fields);
    const actions = el('div',{class:'dni-ops-actions'},el('button',{type:'submit',class:'dni-ops-primary',text:options.submitText || 'Save'}));
    if (options.cancel) actions.append(button('Cancel',options.cancel));
    form.append(actions);
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if (!form.reportValidity() || busy) return;
      const submitButton = form.querySelector('[type=submit]'); submitButton.disabled=true;
      try { await submit(form); } catch { submitButton.disabled=false; }
    });
    return form;
  }
  const resource = (name,params={}) => api(name,params);
  function rowActions(...buttons) { return el('div',{class:'dni-ops-actions'},...buttons); }
  function record(titleText,body,actions=[],extra=[]) { return section(title(titleText,4),...body,...extra,rowActions(...actions)); }
  function selectPersonnel(people, value=null, multi=false) {
    const choices = [[ '', 'Unassigned' ],...people.map(p=>[p.id,`${p.name} · ${p.rank || 'Unranked'}`])];
    return multi ? field('Assigned personnel (hold Ctrl to select multiple)','assignees',value,{choices}) : field('Assigned personnel','assignedTo',value??'',{choices});
  }
  const choices = entries => entries.map(value=>[value,value.replaceAll('_',' ')]);
  const clearance = value => field('Minimum clearance','minimumClearance',value??1,{type:'number',min:1,max:6,required:true});
  async function personnel(code=corp) { return (await resource('personnel',{corp:code})).personnel; }
  async function inventory(code=corp) { return (await resource('inventory',{corp:code})).items; }
  function chooseView(next) { view=next; refresh(); }
  function availableViews() {
    const out=[['overview','Overview'],['directory','Directory']];
    if (can('operations.tasks.read')) out.push(['tasks','Tasks & Contracts']);
    if (['logistics','engineering'].includes(corp) && can('operations.inventory.read')) out.push(['inventory','Inventory'],['supply','Supply Requests']);
    if (['army','navy'].includes(corp) && (can('operations.loadout.request') || can('operations.loadout.manage'))) out.push(['loadout','Loadouts']);
    if (['army','navy','logistics','engineering'].includes(corp) && (own() || session.admin)) out.push(['requisitions','Requisitions']);
    if (corp==='security' && (isb('submit') || isb('manage') || isb('readRestricted'))) out.push(['isb','ISB Operations']);
    if (session.admin) out.push(['settings','Access Settings']);
    return out;
  }
  function navigation() {
    const options=availableViews();
    if (!options.some(([key])=>key===view)) view='overview';
    subnav.replaceChildren(...options.map(([key,label])=>button(label,()=>chooseView(key),{'aria-pressed':view===key?'true':'false'})));
    selector.value=corp;
    for (const item of directory.querySelectorAll('button')) item.setAttribute('aria-current',String(item.dataset.department===corp));
  }
  async function refresh() {
    if (!session || panel.hidden && shell.dataset.panel!=='operations') return;
    const current=++generation;
    navigation();
    content.replaceChildren(el('p',{class:'dni-ops-loading',text:'Loading authorized records…'}));
    try {
      let output;
      switch(view) {
        case 'overview': output=await overview(); break;
        case 'directory': output=await directoryView(); break;
        case 'tasks': output=await tasksView(); break;
        case 'inventory': output=await inventoryView(); break;
        case 'supply': output=await supplyView(); break;
        case 'loadout': output=await loadoutView(); break;
        case 'requisitions': output=await requisitionsView(); break;
        case 'isb': output=await isbView(); break;
        case 'settings': output=await settingsView(); break;
        default: output=empty('Select a department section.');
      }
      if (current===generation) content.replaceChildren(output);
    } catch(error) {
      if (current===generation) { content.replaceChildren(section(title('Access unavailable'),paragraph(error.message))); showError(error); }
    }
  }
  async function overview() {
    const info=DEPARTMENTS.find(d=>d[0]===corp);
    const available=availableViews().filter(([key])=>!['overview','settings'].includes(key));
    return section(el('div',{class:'module-kicker',text:label(corp)}),title(info[1]),paragraph(info[2]),
      paragraph('Select a section to view records authorized for your existing DNI rank and department. All operational changes are checked by the server.'),
      el('div',{class:'dni-ops-tiles'},available.map(([key,name])=>button(name,()=>chooseView(key),{class:'dni-ops-tile'}))));
  }
  async function directoryView() {
    const data=(await resource('directory',{corp})).directory;
    const root=el('div',{class:'dni-ops-stack'});
    root.append(section(title('Department directory'),paragraph(data.purpose || 'Purpose has not been configured.'),
      title('Leadership',4),data.leadership?.length ? el('ul',{},data.leadership.map(p=>el('li',{text:`${p.name} · ${p.title}`}))) : empty('No leadership entries have been published.'),
      title('Subdivisions',4),data.subdivisions?.length ? el('ul',{},data.subdivisions.map(s=>el('li',{text:s}))) : empty('No subdivisions have been published.'),
      title('Training documents',4),data.trainingDocuments?.length ? el('ul',{},data.trainingDocuments.map(doc=>el('li',{},el('a',{href:'/documents',text:`${doc.fileCode} · ${doc.title}`})))) : empty('No authorized training documents are available.')));
    if (data.canManage) {
      const people=await personnel();
      let leaders=(data.leadership||[]).map(p=>({...p}));
      let subdivisions=[...(data.subdivisions||[])];
      let docs=(data.trainingDocuments||[]).map(d=>d.fileCode);
      const editor=el('div',{class:'dni-ops-stack'});
      const leaderList=el('div',{class:'dni-ops-stack'});
      const renderLeaders=()=>leaderList.replaceChildren(...leaders.map((entry,i)=>el('div',{class:'dni-ops-inline'},
        field('Member',`leader-${i}`,entry.userId,{choices:people.map(p=>[p.id,p.name])}),field('Position',`title-${i}`,entry.title),button('Remove',()=>{leaders.splice(i,1);renderLeaders();}))));
      renderLeaders();
      editor.append(submitForm('Edit directory',[
        field('Purpose','purpose',data.purpose,{type:'textarea'}),clearance(data.minimum_clearance),
        el('div',{},title('Leadership',5),leaderList,button('Add leader',()=>{leaders.push({userId:people[0]?.id||'',title:''});renderLeaders();},{disabled:people.length===0})),
        field('Subdivisions (one per line)','subdivisions',subdivisions.join('\n'),{type:'textarea'}),
        field('Training document codes (one DNI-### per line)','trainingDocuments',docs.join('\n'),{type:'textarea'})
      ],async form=>{
        const value=values(form);
        const items=leaders.map((entry,i)=>({userId:number(form.elements[`leader-${i}`].value),title:form.elements[`title-${i}`].value}));
        await write('directory.save',{corp,purpose:value.purpose,minimumClearance:number(value.minimumClearance),leadership:items,subdivisions:lines(value.subdivisions),trainingDocuments:lines(value.trainingDocuments)});
      }));
      root.append(details('Edit department directory',editor));
    }
    return root;
  }
  async function tasksView() {
    const tasks=(await resource('tasks',{corp})).tasks;
    const people=await personnel();
    const root=el('div',{class:'dni-ops-stack'});
    const formFor = (item=null) => {
      const form=submitForm(item?'Edit assignment':'Create task or contract',[
        field('Type','kind',item?.kind||'task',{choices:choices(['task','contract'])}),
        field('Title','title',item?.title||'',{required:true,maxlength:200}),
        field('Description','description',item?.description||'',{type:'textarea'}),
        field('Priority','priority',item?.priority||'normal',{choices:choices(['low','normal','high','critical'])}),
        field('Status','status',item?.status||'open',{choices:choices(item ? ({open:['open','assigned','cancelled'],assigned:['assigned','open','in_progress','cancelled'],in_progress:['in_progress','assigned','completed','cancelled'],completed:['completed'],cancelled:['cancelled']}[item.status]||[item.status]) : ['open','assigned'])}),
        clearance(item?.minimum_clearance),field('Deadline (local time)','deadlineAt',dateValue(item?.deadline_at),{type:'datetime-local'}),
        field('Assignees','assignees','',{choices:people.map(p=>[p.id,`${p.name} · ${p.rank}`])})
      ],async form=>{
        const v=values(form);
        const selected=[...form.elements.assignees.selectedOptions].map(o=>Number(o.value));
        await write('task.save',{corp,id:item?.id,version:item?.version,kind:v.kind,title:v.title,description:v.description,priority:v.priority,status:v.status,minimumClearance:number(v.minimumClearance),deadlineAt:v.deadlineAt?new Date(v.deadlineAt).toISOString():null,assignees:selected});
      });
      form.elements.assignees.multiple=true;
      form.elements.assignees.size=Math.min(6,Math.max(2,people.length));
      for (const option of form.elements.assignees.options) option.selected=(item?.assignees||[]).some(a=>String(a.userId)===option.value);
      return form;
    };
    if (can('operations.tasks.manage')) root.append(details('Create assignment',formFor()));
    root.append(tasks.length?el('div',{class:'dni-ops-records'},tasks.map(item=>{
      const actions=[];
      if (item.canManage) actions.push(button('Edit',()=>openEditor(formFor(item))));
      const comments=submitForm('Add activity note',[field('Note','note','',{type:'textarea',required:true,max:1000})],async f=>write('task.comment',{id:item.id,note:values(f).note}),{submitText:'Add note'});
      const card=record(item.title,[badge(`${item.kind} · ${item.status} · ${item.priority}`),paragraph(item.description),paragraph(`Due: ${formatDate(item.deadline_at)}`),paragraph(`Assigned: ${(item.assignees||[]).map(a=>a.name).join(', ')||'Unassigned'}`)],actions,[details('Activity history',eventList(item.events)),...(!['completed','cancelled'].includes(item.status)?[details('Add activity note',comments)]:[])]);
      return card;
    })):empty('No authorized assignments are available.'));
    return root;
  }
  function openEditor(form) {
    const host=el('div',{class:'dni-ops-editor'},button('Close editor',()=>host.remove()),form);
    content.prepend(host);
    host.scrollIntoView({block:'nearest',behavior:'smooth'});
    form.querySelector('input,textarea,select')?.focus();
  }
  async function inventoryView() {
    const items=await inventory();
    const root=el('div',{class:'dni-ops-stack'});
    const formFor=item=>submitForm(item?'Edit inventory item':'Create inventory item',[
      field('Name','name',item?.name||'',{required:true,maxlength:160}),field('Category','category',item?.category||'',{required:true,maxlength:80}),
      field('Description','description',item?.description||'',{type:'textarea'}),field('Unit','unit',item?.unit||'unit',{required:true,maxlength:32}),
      clearance(item?.minimum_clearance),field('Active','active',item?Number(item.active)===1:true,{type:'checkbox'})
    ],async form=>{const v=values(form);await write('inventory.save',{corp,id:item?.id,version:item?.version,name:v.name,category:v.category,description:v.description,unit:v.unit,minimumClearance:number(v.minimumClearance),active:boolValue(form,'active')});});
    if(can('operations.inventory.manage')) root.append(details('Create inventory item',formFor()));
    root.append(items.length?el('div',{class:'dni-ops-records'},items.map(item=>{
      const actions=item.canManage?[button('Edit',()=>openEditor(formFor(item)))]:[];
      const extras=[];
      if(item.canManage) extras.push(details('Adjust stock',submitForm('Stock adjustment',[
        field('Change in quantity (+ / −)','delta','',{type:'number',min:-2147483647,max:2147483647,required:true}),field('Reason','reason','',{required:true,maxlength:255})
      ],async f=>{const v=values(f);await write('inventory.adjust',{id:item.id,delta:number(v.delta),reason:v.reason});},{submitText:'Record adjustment'})),details('Stock history',eventList(item.events)));
      return record(item.name,[badge(item.category),paragraph(item.description),paragraph(`${item.quantity} ${item.unit} available`),badge(Number(item.active)===1?'Active':'Inactive')],actions,extras);
    })):empty('No inventory items have been created.'));
    return root;
  }
  async function supplyView() {
    const [catalog,requests]=await Promise.all([resource('supply-catalog'),resource('inventory-requests')]);
    const root=el('div',{class:'dni-ops-stack'});
    const other=catalog.items.filter(item=>item.corp_code!==corp);
    if(other.length) root.append(details('Request equipment from another department',submitForm('New supply request',[
      field('Equipment','itemId',other[0].id,{choices:other.map(i=>[i.id,`${i.name} · ${label(i.corp_code)}`])}),
      field('Quantity','quantity',1,{type:'number',min:1,max:2147483647,required:true}),field('Notes','notes','',{type:'textarea',max:1000})
    ],async f=>{const v=values(f);await write('inventory-request.submit',{itemId:number(v.itemId),quantity:number(v.quantity),notes:v.notes});},{submitText:'Submit supply request'})));
    else root.append(empty('No authorized equipment is listed in the other department.'));
    root.append(title('Supply requests'));
    root.append(requests.requests.length?el('div',{class:'dni-ops-records'},requests.requests.map(req=>{
      const item=catalog.items.find(i=>i.id==req.item_id);
      const manage=can('operations.inventory.manage',req.fulfilling_corp_code);
      const actions=[];
      if(manage && req.status==='pending') actions.push(button('Approve',()=>write('inventory-request.transition',{id:req.id,status:'approved'})),button('Reject',()=>askTransition('inventory-request.transition',req.id,'rejected')));
      if(manage && req.status==='approved') actions.push(button('Fulfill',()=>confirmAction('Fulfill this request and deduct the owner’s stock?',()=>write('inventory-request.transition',{id:req.id,status:'fulfilled'}))));
      if(['pending','approved'].includes(req.status)&&(manage||req.requested_by==session.user.id)) actions.push(button('Cancel',()=>write('inventory-request.transition',{id:req.id,status:'cancelled'})));
      return record(`Supply request #${req.id}`,[paragraph(`${item?.name||'Equipment'} · ${req.quantity} units`),paragraph(`${label(req.requester_corp_code)} → ${label(req.fulfilling_corp_code)}`),badge(req.status),paragraph(req.notes)],actions);
    })):empty('No supply requests are available.'));
    return root;
  }
  async function loadoutView() {
    const data=await resource('loadout',{corp});
    const root=el('div',{class:'dni-ops-stack'});
    const manager=can('operations.loadout.manage');
    const formFor=item=>submitForm(item?'Edit equipment':'Configure equipment',[
      field('Equipment name','name',item?.name||'',{required:true,maxlength:160}),field('Details','details',item?.details||'',{type:'textarea'}),
      field('Wiki reference (optional)','wikiUrl',item?.wiki_url||'',{type:'url',maxlength:500}),
      field('Standard Issue · Free','isStandardIssue',Boolean(item?.is_standard_issue),{type:'checkbox'}),
      field('Optional cost (aUEC)','costAuec',item?.cost_auec??'',{type:'number',min:0,max:2147483647}),
      field('Active','active',item?Number(item.active)===1:true,{type:'checkbox'})
    ],async form=>{const v=values(form);await write('loadout.save',{branch:corp,id:item?.id,version:item?.version,name:v.name,details:v.details,wikiUrl:v.wikiUrl,isStandardIssue:boolValue(form,'isStandardIssue'),costAuec:v.costAuec===''?null:number(v.costAuec),active:boolValue(form,'active')});});
    if(manager) root.append(details('Configure Standard Issue and equipment',formFor()));
    root.append(data.items.length?el('div',{class:'dni-ops-records'},data.items.map(item=>record(item.name,[badge(item.is_standard_issue?'Standard Issue · Free':item.cost_auec===null?'Optional · Price not configured':`Optional · ${Number(item.cost_auec).toLocaleString()} aUEC`),paragraph(item.details),item.wiki_url?el('a',{href:item.wiki_url,target:'_blank',rel:'noopener noreferrer',text:'Equipment reference'}):null],[...(manager?[button('Edit',()=>openEditor(formFor(item)))]:[])]))):empty('No equipment is configured for this branch.'));
    if(can('operations.loadout.request')) {
      const active=data.items.filter(i=>Number(i.active)===1);
      const cart=el('div',{class:'dni-ops-cart'});
      const form=submitForm('Build your requisition',[
        paragraph('Standard Issue is free. Optional aUEC prices are informational; no currency is deducted.'),
        field('Fulfillment department','fulfillingCorp','logistics',{choices:[['logistics','Logistics'],['engineering','Engineering']]}),cart,
        field('Notes','notes','',{type:'textarea',max:1000})
      ],async f=>{
        const v=values(f);const items=[];
        for(const item of active){const qty=number(f.elements[`qty-${item.id}`]?.value)||0;if(qty>0)items.push({id:item.id,quantity:qty});}
        if(!items.length){setNotice('Select at least one equipment item.',true);return;}
        await write('requisition.submit',{branch:corp,fulfillingCorp:v.fulfillingCorp,items,notes:v.notes});
      },{submitText:'Submit requisition'});
      cart.replaceChildren(...active.map(i=>field(`${i.name} · ${i.is_standard_issue?'Free':i.cost_auec===null?'Price pending':Number(i.cost_auec).toLocaleString()+' aUEC'}`,`qty-${i.id}`,0,{type:'number',min:0,max:1000,step:1})));
      root.append(details('Build a loadout request',form));
    }
    return root;
  }
  async function requisitionsView() {
    const data=await resource('requisitions');
    const root=el('div',{class:'dni-ops-stack'});
    root.append(title('Requisition queue'));
    const requests=data.requests.filter(req=>['logistics','engineering'].includes(corp)?req.fulfilling_corp_code===corp:req.branch_code===corp);
    root.append(requests.length?el('div',{class:'dni-ops-records'},requests.map(req=>{
      const manage=can('operations.loadout.fulfill',req.fulfilling_corp_code);
      const actions=[];
      if(manage&&req.status==='pending')actions.push(button('Approve',()=>write('requisition.transition',{id:req.id,status:'approved'})),button('Reject',()=>askTransition('requisition.transition',req.id,'rejected')));
      if(manage&&req.status==='approved')actions.push(button('Fulfill',()=>confirmAction('Fulfill this requisition and deduct the mapped stock?',()=>write('requisition.transition',{id:req.id,status:'fulfilled'}))));
      if(['pending','approved'].includes(req.status)&&(manage||req.requester_user_id==session.user.id))actions.push(button('Cancel',()=>write('requisition.transition',{id:req.id,status:'cancelled'})));
      const extras=[details('Activity history',eventList(req.events))];
      if(manage&&['pending','approved'].includes(req.status))extras.push(details('Map fulfillment stock',el('div',{class:'dni-ops-stack'},(req.items||[]).map(line=>{
        const host=el('div');
        inventory(req.fulfilling_corp_code).then(items=>{
          host.replaceChildren(submitForm(`Map ${line.name_snapshot}`,[field('Inventory item','inventoryItemId',line.inventory_item_id||'',{choices:[['','Select stock item'],...items.filter(i=>Number(i.active)===1).map(i=>[i.id,`${i.name} · ${i.quantity} ${i.unit}`])],required:true})],async f=>write('requisition.map',{id:req.id,loadoutItemId:line.loadout_item_id,inventoryItemId:number(values(f).inventoryItemId)}),{submitText:'Save mapping'}));
        }).catch(error=>host.replaceChildren(paragraph(error.message)));
        return host;
      }))));
      const total=(req.items||[]).reduce((sum,i)=>sum+Number(i.cost_auec_snapshot||0)*Number(i.quantity),0);
      return record(`Requisition #${req.id}`,[badge(`${req.status} · ${label(req.branch_code)}`),paragraph(`Fulfillment: ${label(req.fulfilling_corp_code)}`),paragraph(req.notes),el('ul',{},(req.items||[]).map(i=>el('li',{text:`${i.quantity} × ${i.name_snapshot} · ${i.standard_issue_snapshot?'Free':i.cost_auec_snapshot===null?'Price pending':Number(i.cost_auec_snapshot).toLocaleString()+' aUEC each'}`}))),paragraph(`Quoted optional equipment total: ${total.toLocaleString()} aUEC. No currency deducted.`)],actions,extras);
    })):empty('No requisitions are available for this department.'));
    return root;
  }
  async function isbView() {
    const data=await resource('isb');
    const root=el('div',{class:'dni-ops-stack'});
    root.append(section(title('Imperial Security Bureau'),paragraph('Operation requests are restricted. HC2+ may submit requests. Review, assignment, and case access require separately configured authorization.')));
    if(isb('submit'))root.append(details('Submit ISB operation request',submitForm('New ISB operation',[
      field('Operation type','type','investigation',{choices:[['investigation','Investigation'],['field_ops','Field Ops'],['reconnaissance','Reconnaissance']]}),
      field('Title','title','',{required:true,maxlength:200}),field('Summary','summary','',{type:'textarea',required:true})
    ],async f=>{const v=values(f);await write('isb.submit',{type:v.type,title:v.title,summary:v.summary});},{submitText:'Submit secure request'})));
    root.append(data.operations.length?el('div',{class:'dni-ops-records'},data.operations.map(op=>{
      const actions=[];const extras=[];
      if(op.canManage&& !['completed','rejected'].includes(op.status)) {
        const statuses={submitted:['under_review','rejected'],under_review:['assigned','rejected'],assigned:['active','rejected'],active:['completed','rejected']}[op.status]||[];
        const manageForm=submitForm('Review and assign',[
          field('New status','status',statuses[0]||'',{choices:choices(statuses)}),
          field('Assigned ISB member','assignedTo',op.assigned_to||'',{choices:[['','Unassigned']]}),field('Decision note','note','',{type:'textarea',max:1000})
        ],async f=>{const v=values(f);await write('isb.manage',{id:op.id,status:v.status,assignedTo:v.assignedTo?number(v.assignedTo):null,note:v.note});},{submitText:'Record decision'});
        personnel('security').then(people=>{
          const select=manageForm.elements.assignedTo;
          select.append(...people.map(p=>el('option',{value:p.id,text:`${p.name} · ${p.rank}`})));
          select.value=String(op.assigned_to||'');
        }).catch(showError);
        extras.push(details('Review / assignment',manageForm));
      }
      if(op.canReadRestricted) {
        extras.push(details('Restricted case notes',...(op.caseNotes||[]).map(n=>section(paragraph(n.note),badge(formatDate(n.created_at))))));
        if(op.canManage||op.assigned_to==session.user.id)extras.push(details('Add restricted case note',submitForm('Case note',[field('Note','note','',{type:'textarea',required:true})],async f=>write('isb.note',{id:op.id,note:values(f).note}),{submitText:'Add secure note'})));
        extras.push(details('Operation activity',eventList(op.events)));
      }
      return record(`ISB #${op.id} · ${op.title}`,[badge(`${op.op_type.replaceAll('_',' ')} · ${op.status}`),paragraph(op.summary),paragraph(`Submitted: ${formatDate(op.created_at)}`)],actions,extras);
    })):empty('No authorized ISB requests are available.'));
    return root;
  }
  async function settingsView() {
    const data=await resource('settings');
    const grants=structuredClone(data.permissionGrants||{});
    const root=el('div',{class:'dni-ops-stack'});
    const list=el('div',{class:'dni-ops-stack'});
    const renderGrants=()=>list.replaceChildren(...Object.entries(grants).flatMap(([cap,entries])=>entries.map((entry,i)=>section(paragraph(`${cap} · ${entry.corp}`),paragraph(`Users: ${(entry.userIds||[]).join(', ')||'None'}`),paragraph(`Discord roles: ${(entry.roleIds||[]).join(', ')||'None'}`),button('Remove grant',()=>{entries.splice(i,1);renderGrants();})))));
    renderGrants();
    const permissionChoices=['operations.division.manage','operations.tasks.manage','operations.inventory.manage','operations.loadout.fulfill','operations.isb.submit','operations.isb.manage','operations.isb.read_restricted'].map(v=>[v,v]);
    const add=submitForm('Add a scoped grant',[
      field('Capability','capability',permissionChoices[0][0],{choices:permissionChoices}),
      field('Department scope','corp','security',{choices:[['*','Any authorized department'],...DEPARTMENTS.map(d=>[d[0],d[1]])]}),
      field('Existing DNI user IDs (comma-separated)','userIds',''),field('Synchronized Discord role IDs (comma-separated)','roleIds','')
    ],async f=>{const v=values(f);const entry={corp:v.corp,userIds:v.userIds.split(',').map(s=>s.trim()).filter(Boolean).map(Number),roleIds:v.roleIds.split(',').map(s=>s.trim()).filter(Boolean)};
      (grants[v.capability] ||= []).push(entry);renderGrants();f.reset();},{submitText:'Add grant to configuration'});
    root.append(section(title('Operations access configuration'),paragraph('Only existing DNI administrators can save these grants. ISB permissions must be scoped to Security. Role IDs must already exist in the synchronized roster.'),list,add,button('Save access configuration',()=>write('settings.save',{permissionGrants:grants}),{class:'dni-ops-primary'})),details('Operations audit',eventList((data.audit||[]).map(row=>({...row,event_type:row.action,note:`${row.entity_type} ${row.entity_id}`})))));
    return root;
  }
  function askTransition(action,id,status) {
    openEditor(submitForm(`Record ${status} decision`,[field('Reason','note','',{type:'textarea',required:true,max:500})],async f=>write(action,{id,status,note:values(f).note}),{submitText:'Confirm decision'}));
  }
  function confirmAction(message,action) {
    // Confirmation is a safety affordance, not a substitute for server checks.
    if(window.confirm(message)) action().catch(()=>{});
  }
  for(const [code,name] of DEPARTMENTS) {
    selector.append(el('option',{value:code,text:name}));
    directory.append(button(name,()=>{corp=code;view='overview';refresh();},{'data-department':code}));
  }
  selector.addEventListener('change',()=>{corp=selector.value;view='overview';refresh();});
  async function initialize() {
    try {
      session=await api('session');
      showTab(true);
      const path=location.pathname.replace(/\/+$/,'');
      if(path==='/operations') {
        const requested=new URLSearchParams(location.search).get('department');
        if(DEPARTMENTS.some(d=>d[0]===requested)) corp=requested;
      }
      navigation();
      if(shell.dataset.panel==='operations') {panel.hidden=false;await refresh();}
    } catch(error) {
      session=null;showTab(false);
      if(location.pathname.replace(/\/+$/,'')==='/operations') location.replace(error.status===401?'/terminal':'/dashboard');
    }
  }
  function syncPanel() {const active=shell.dataset.panel==='operations'&&Boolean(session);panel.hidden=!active;tab.setAttribute('aria-selected',String(active));if(active)refresh();}
  window.addEventListener('dni:panel',syncPanel);
  window.addEventListener('dni:citizen-access',event=>{if(event.detail?.citizen===true){session=null;showTab(false);}});
  window.addEventListener('dni:authz',event=>{if(event.detail?.authenticated===false){session=null;showTab(false);}});
  initialize();
}
