<?php
declare(strict_types=1);
/* Isolated contract tests: production SQL and engine, synthetic identities.
 * No real session, Discord account, or production database is accessed. */
$sourceRoot=dirname(__DIR__,2);
$root=sys_get_temp_dir().'/dni-ops-test-'.bin2hex(random_bytes(5));
mkdir($root.'/server/php',0700,true);mkdir($root.'/database/migrations',0700,true);
copy($sourceRoot.'/server/php/dni-operations.php',$root.'/server/php/dni-operations.php');
// The fixture deliberately uses synthetic admin flags; the separate access
// regression tests exercise the real canonical Discord authorization helper.
file_put_contents($root.'/server/php/dni-operations-access.php', <<<'PHP'
<?php
function dni_operations_staff_authorized(?array $u): bool { return dni_is_admin_authorized($u); }
PHP
);
copy($sourceRoot.'/database/migrations/018_dni_operations.sql',$root.'/database/migrations/018_dni_operations.sql');
foreach(['dni.php','dni-authz.php','dni-embedded.php','dni-clearance.php','dni-operational-security.php','dni-documents.php'] as $file)file_put_contents($root.'/server/php/'.$file,"<?php\n");
define('DNI_ROOT',$root);
define('DNI_BASE_MEMBER_DISCORD_ROLE_ID','1107374226496827553');
$GLOBALS['testDb']=['users'=>[],'documents'=>[['fileCode'=>'DNI-001','title'=>'Training','clearanceLevel'=>1,'status'=>'published','classificationStatus'=>'final','requiredPermission'=>null]],'network'=>[]];
$GLOBALS['testActor']=1;
function dni_is_admin_authorized(?array $u):bool{return (bool)($u['admin']??false);}
function dni_user_discord_role_ids(?array $u):array{return array_map('strval',$u['roles']??[]);}
function dni_user_has_discord_role(?array $u,string $id):bool{return in_array($id,dni_user_discord_role_ids($u),true);}
function dni_is_citizen_user(?array $u):bool{return (bool)($u['citizen']??false);}
function dni_embedded_corps():array{return array_map(fn($c)=>['id'=>$c[0],'code'=>$c[1],'active'=>true],[[1,'command'],[7,'security'],[8,'army'],[2,'navy'],[3,'medical'],[4,'engineering'],[5,'logistics']]);}
function dni_embedded_ranks():array{$r=[];foreach(['hc-3'=>127,'hc-2s'=>126,'hc-2'=>125,'hc-1'=>124] as $c=>$id)$r[]=['id'=>$id,'code'=>$c];for($n=1;$n<=9;$n++)$r[]=['id'=>114+$n,'code'=>'o-'.$n];for($n=0;$n<=9;$n++)$r[]=['id'=>101+$n,'code'=>'e-'.$n];$r[]=['id'=>111,'code'=>'e-9s'];$r[]=['id'=>4,'code'=>'lieutenant'];return $r;}
function dni_embedded_effective_clearance_state(array $u):array{return ['level'=>(int)($u['level']??0)];}
function dni_clearance_normalize_level(mixed $v):int{if(!is_int($v)&&!(is_string($v)&&ctype_digit($v)))throw new InvalidArgumentException('Invalid clearance');$n=(int)$v;if($n<0||$n>6)throw new InvalidArgumentException('Invalid clearance');return $n;}
function dni_clearance_descriptor(int $n):array{return ['level'=>$n,'code'=>'CL'.$n,'name'=>'Level '.$n];}
function dni_operational_row_level(array $row):int{return (int)($row['minimumClearance']??$row['clearanceLevel']??0);}
function dni_embedded_operational_permissions(?array $u):array{return dni_is_admin_authorized($u)?['admin','operational.classify']:[];}
function dni_operational_has(array $p,string $key):bool{return in_array('admin',$p,true)||in_array($key,$p,true);}
function dni_embedded_authorized_documents(array $db,?array $u,string $q='',bool $body=false):array{return array_values(array_filter($db['documents']??[],fn($d)=>$d['clearanceLevel']<=($u['level']??0)));}
function dni_document_file_code(mixed $v):?string{$v=strtoupper(trim((string)$v));$v=preg_replace('/^DNI-/','',$v);return preg_match('/^\d{1,6}$/D',$v)?'DNI-'.str_pad((string)(int)$v,3,'0',STR_PAD_LEFT):null;}
function dni_embedded_read_store(PDO $pdo):array{return $GLOBALS['testDb'];}
function dni_embedded_current_user(array $db):?array{foreach($db['users'] as $u)if($u['id']===$GLOBALS['testActor']&&$u['accountStatus']==='active')return $u;return null;}
function dni_csrf_token():string{return str_repeat('a',64);}
require $root.'/server/php/dni-operations.php';
if(extension_loaded('pdo_sqlite'))$pdo=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
else{require __DIR__.'/sqlite-ffi.php';$pdo=new TestSqlite();}
$passed=0;
function check(bool $ok,string $message):void{global $passed;if(!$ok)throw new RuntimeException('FAIL: '.$message);$passed++;}
function denied(callable $fn,int $code=403):void{global $passed;try{$fn();}catch(RuntimeException $e){if($e->getCode()===$code){$passed++;return;}throw new RuntimeException('Expected '.$code.', got '.$e->getCode().': '.$e->getMessage(),0,$e);}throw new RuntimeException('Expected denial '.$code);}
function user(int $id,int $rank,int $corp,int $level,bool $admin=false,bool $citizen=false):array{return ['id'=>$id,'username'=>'Member'.$id,'accountStatus'=>'active','roles'=>[DNI_BASE_MEMBER_DISCORD_ROLE_ID],'admin'=>$admin,'citizen'=>$citizen,'level'=>$level,'personnel'=>['rankId'=>$rank,'corpId'=>$corp,'displayName'=>'Member '.$id,'status'=>'active']];}
$GLOBALS['testDb']['users']=[user(1,127,1,6,true),user(2,115,8,4),user(3,106,8,3),user(4,116,2,4),user(5,117,5,4),user(6,118,4,4),user(7,125,1,6),user(8,119,7,6),user(9,106,7,6),user(10,103,8,1,false,true),user(11,110,8,4),user(12,115,8,4),user(13,4,8,4),user(14,124,8,6),user(15,124,4,6),user(16,115,8,4)];
$GLOBALS['testDb']['users'][11]['accountStatus']='disabled';
$GLOBALS['testDb']['users'][15]['roles']=[];
function asUser(int $id):DniOperations{global $pdo;$GLOBALS['testActor']=$id;foreach($GLOBALS['testDb']['users'] as $u)if($u['id']===$id)return new DniOperations($pdo,$GLOBALS['testDb'],$u);throw new RuntimeException('Fixture missing');}
function w(int $id,string $action,array $data=[],?string $key=null):array{$op=asUser($id);return $op->write($action,['requestKey'=>$key??bin2hex(random_bytes(16))]+$data);}
function r(int $id,string $resource,array $query=[]):array{return asUser($id)->read($resource,$query);}
DniOperations::schema($pdo);DniOperations::schema($pdo);
check(count($pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dni_ops_%'")->fetchAll())===20,'Schema includes all operations tables');
check(r(3,'session')['capabilities']['army']['operations.tasks.manage']===false,'Enlisted cannot manage');
check(r(2,'session')['capabilities']['army']['operations.tasks.manage']===true,'O-1 may manage own department');
check(r(11,'session')['capabilities']['army']['operations.tasks.manage']===false,'E-9 clearance is not officer rank');
check(r(2,'session')['capabilities']['navy']['operations.tasks.manage']===false,'Officer cannot manage another department');
denied(fn()=>asUser(10));denied(fn()=>asUser(12));check(r(13,'session')['capabilities']['army']['operations.tasks.manage']===false,'Unknown legacy rank grants no officer management');denied(fn()=>asUser(16));
check(r(7,'session')['isb']['submit']===true,'HC-2 may submit ISB requests');
check(r(2,'session')['isb']['submit']===false,'O-1 cannot submit ISB requests');
check(r(1,'session')['isb']['manage']===false,'ISB management is not automatically granted to admins');
$grants=['operations.isb.manage'=>[['corp'=>'security','userIds'=>[8],'roleIds'=>[]]],'operations.isb.read_restricted'=>[['corp'=>'security','userIds'=>[8],'roleIds'=>[]]],'operations.division.manage'=>[['corp'=>'army','userIds'=>[14],'roleIds'=>[]]]];
w(1,'settings.save',['permissionGrants'=>$grants]);
check(r(8,'session')['isb']['manage']===true,'Explicit ISB manager grant works');
$securityTask=w(8,'task.save',['corp'=>'security','title'=>'Routine security training','status'=>'assigned','minimumClearance'=>1,'assignees'=>[9]])['task'];
check(count(r(9,'tasks',['corp'=>'security'])['tasks'])===1,'Routine Security tasks remain available to authorized enlisted members');
check(r(14,'directory',['corp'=>'army'])['directory']['canManage']===true,'Scoped division editor works');
denied(fn()=>w(1,'settings.save',['permissionGrants'=>['operations.isb.manage'=>[['corp'=>'*','userIds'=>[8],'roleIds'=>[]]]]]),422);
$task=w(2,'task.save',['corp'=>'army','kind'=>'task','title'=>'Training assignment','description'=>'Complete drills','priority'=>'normal','status'=>'assigned','minimumClearance'=>1,'assignees'=>[3]])['task'];
check(count(r(3,'tasks',['corp'=>'army'])['tasks'])===1,'Enlisted sees own department tasks');
denied(fn()=>r(4,'tasks',['corp'=>'army']));
denied(fn()=>w(3,'task.save',['corp'=>'army','title'=>'Unauthorized']));
$comment=w(3,'task.comment',['id'=>$task['id'],'note'=>'Training started']);
check(count($comment['task']['events'])>=3,'Assignee activity is retained');
denied(fn()=>w(2,'task.save',['id'=>$task['id'],'version'=>999,'title'=>'Stale edit']),409);
$updated=w(2,'task.save',['id'=>$task['id'],'version'=>$task['version'],'status'=>'in_progress'])['task'];
check($updated['status']==='in_progress'&&count($updated['assignees'])===1,'Task transition preserves assignees');
denied(fn()=>w(2,'task.save',['id'=>$task['id'],'version'=>$updated['version'],'status'=>'open']),409);
$taskDone=w(2,'task.save',['id'=>$task['id'],'version'=>$updated['version'],'status'=>'completed'])['task'];
check($taskDone['status']==='completed','Task completion persists');
$classified=w(2,'task.save',['corp'=>'army','title'=>'Classified assignment','minimumClearance'=>4])['task'];
denied(fn()=>w(2,'task.save',['id'=>$classified['id'],'version'=>$classified['version'],'minimumClearance'=>1]),403);
check(count(r(3,'tasks',['corp'=>'army'])['tasks'])===1,'Lower-clearance enlisted cannot see classified tasks');
$directory=w(14,'directory.save',['corp'=>'army','purpose'=>'Ground operations','minimumClearance'=>1,'leadership'=>[['userId'=>14,'title'=>'Commander']],'subdivisions'=>['Infantry'],'trainingDocuments'=>['DNI-001']])['directory'];
check($directory['purpose']==='Ground operations'&&count($directory['trainingDocuments'])===1,'Directory and existing document references work');
$stock=w(5,'inventory.save',['corp'=>'logistics','name'=>'Field kit','category'=>'Equipment','description'=>'Test stock','unit'=>'kit','minimumClearance'=>1,'active'=>true])['item'];
check($stock['quantity']===0,'New stock starts at zero');
$stock=w(5,'inventory.adjust',['id'=>$stock['id'],'delta'=>10,'reason'=>'Initial delivery'])['item'];
check($stock['quantity']===10,'Stock adjustment is materialized');
denied(fn()=>w(6,'inventory.adjust',['id'=>$stock['id'],'delta'=>1,'reason'=>'Cross-department edit']));
denied(fn()=>w(5,'inventory.adjust',['id'=>$stock['id'],'delta'=>-11,'reason'=>'Overdraft']),409);
check(r(5,'inventory',['corp'=>'logistics'])['items'][0]['quantity']===10,'Failed stock adjustment rolls back');
$key=bin2hex(random_bytes(16));
$one=w(5,'inventory.adjust',['id'=>$stock['id'],'delta'=>1,'reason'=>'Idempotent'], $key);
$two=w(5,'inventory.adjust',['id'=>$stock['id'],'delta'=>1,'reason'=>'Idempotent'], $key);
check($two===['ok'=>true,'replayed'=>true],'Repeated request key returns a safe replay acknowledgement');
denied(fn()=>w(5,'inventory.adjust',['id'=>$stock['id'],'delta'=>1,'reason'=>'Different'], $key),409);
check(r(5,'inventory',['corp'=>'logistics'])['items'][0]['quantity']===11,'Duplicate request never repeats stock adjustment');
$standard=w(14,'loadout.save',['branch'=>'army','name'=>'Standard rifle','details'=>'Standard Issue','isStandardIssue'=>true,'costAuec'=>100,'active'=>true])['item'];
check($standard['cost_auec']===null,'Standard Issue is always free');
$optional=w(14,'loadout.save',['branch'=>'army','name'=>'Optional armor','isStandardIssue'=>false,'costAuec'=>50,'active'=>true])['item'];
denied(fn()=>w(2,'loadout.save',['branch'=>'army','name'=>'Unauthorized']));
$req=w(2,'requisition.submit',['branch'=>'army','fulfillingCorp'=>'logistics','items'=>[['id'=>$standard['id'],'quantity'=>2],['id'=>$optional['id'],'quantity'=>1]],'notes'=>'Training issue'])['request'];
check($req['status']==='pending'&&$req['items'][0]['cost_auec_snapshot']===null,'Requisition contains free Standard Issue snapshot');
check((int)$req['items'][1]['cost_auec_snapshot']===50,'Optional quote is snapshotted');
denied(fn()=>w(4,'requisition.transition',['id'=>$req['id'],'status'=>'approved']));
$req=w(5,'requisition.transition',['id'=>$req['id'],'status'=>'approved'])['request'];
denied(fn()=>w(5,'requisition.transition',['id'=>$req['id'],'status'=>'fulfilled']),409);
foreach($req['items'] as $line)w(5,'requisition.map',['id'=>$req['id'],'loadoutItemId'=>$line['loadout_item_id'],'inventoryItemId'=>$stock['id']]);
$req=w(5,'requisition.transition',['id'=>$req['id'],'status'=>'fulfilled'])['request'];
check($req['status']==='fulfilled','Requisition fulfillment persists');
check(r(5,'inventory',['corp'=>'logistics'])['items'][0]['quantity']===8,'Fulfillment atomically debits aggregated stock');
denied(fn()=>w(5,'requisition.transition',['id'=>$req['id'],'status'=>'fulfilled']),409);
$tooMany=w(2,'requisition.submit',['branch'=>'army','fulfillingCorp'=>'logistics','items'=>[['id'=>$standard['id'],'quantity'=>20]]])['request'];
w(5,'requisition.transition',['id'=>$tooMany['id'],'status'=>'approved']);
w(5,'requisition.map',['id'=>$tooMany['id'],'loadoutItemId'=>$standard['id'],'inventoryItemId'=>$stock['id']]);
denied(fn()=>w(5,'requisition.transition',['id'=>$tooMany['id'],'status'=>'fulfilled']),409);
check(r(5,'inventory',['corp'=>'logistics'])['items'][0]['quantity']===8,'Failed fulfillment leaves stock unchanged');
check(r(6,'supply-catalog')['items'][0]['name']==='Field kit','Interdepartmental catalog exposes permitted metadata');
check(!array_key_exists('quantity',r(6,'supply-catalog')['items'][0]),'Cross-department catalog does not expose stock totals');
$supply=w(6,'inventory-request.submit',['itemId'=>$stock['id'],'quantity'=>2,'notes'=>'Engineering request'])['request'];
w(5,'inventory-request.transition',['id'=>$supply['id'],'status'=>'approved']);
w(5,'inventory-request.transition',['id'=>$supply['id'],'status'=>'fulfilled']);
check(r(5,'inventory',['corp'=>'logistics'])['items'][0]['quantity']===6,'Supply request debits owner inventory only');
denied(fn()=>r(2,'supply-catalog'));
$isb=w(7,'isb.submit',['type'=>'investigation','title'=>'Test investigation','summary'=>'Restricted test summary'])['operation'];
check($isb['status']==='submitted'&&!isset($isb['restricted_notes']),'HC2 submission succeeds without restricted notes');
denied(fn()=>r(3,'isb'));
denied(fn()=>w(7,'isb.manage',['id'=>$isb['id'],'status'=>'under_review']));
$review=w(8,'isb.manage',['id'=>$isb['id'],'status'=>'under_review'])['operation'];
check($review['status']==='under_review','ISB reviewer can review');
$assigned=w(8,'isb.manage',['id'=>$isb['id'],'status'=>'assigned','assignedTo'=>9])['operation'];
check((int)$assigned['assigned_to']===9,'ISB assignment uses existing personnel');
$note=w(8,'isb.note',['id'=>$isb['id'],'note'=>'Confidential test note'])['operation'];
check(count($note['caseNotes'])===1,'Case note is stored in restricted history');
check(!isset(r(7,'isb')['operations'][0]['caseNotes']),'Requester cannot read restricted notes');
$grants['operations.isb.read_restricted'][0]['userIds'][]=9;
w(1,'settings.save',['permissionGrants'=>$grants]);
check(count(r(9,'isb')['operations'])===0 || r(9,'isb')['operations'][0]['canReadRestricted']===true,'Explicit restricted access is required');
$added=w(9,'isb.note',['id'=>$isb['id'],'note'=>'Assigned investigator note'])['operation'];
check(count($added['caseNotes'])===2,'Assigned investigator can append restricted notes');
denied(fn()=>w(9,'isb.manage',['id'=>$isb['id'],'status'=>'active']));
$oldCount=count($added['caseNotes']);
denied(fn()=>w(7,'isb.note',['id'=>$isb['id'],'note'=>'Unauthorized secret']));
check(count(r(8,'isb')['operations'][0]['caseNotes'])===$oldCount,'Unauthorized note does not change case history');
try{$pdo->exec('DELETE FROM dni_ops_isb_case_notes');throw new RuntimeException('Immutable note deletion succeeded');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'Immutable operations history'),'Case notes are append-only');}
try{$pdo->exec('DELETE FROM dni_ops_inventory_stock_events');throw new RuntimeException('Immutable ledger deletion succeeded');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'Immutable operations history'),'Stock ledger is append-only');}
check($pdo->query('PRAGMA integrity_check')->fetchColumn()==='ok','SQLite integrity check passes');
echo "DNI Operations: {$passed} assertions passed using ".(extension_loaded('pdo_sqlite')?'native PDO SQLite':'SQLite FFI test adapter').".\n";
