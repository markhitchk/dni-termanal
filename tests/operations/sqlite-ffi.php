<?php
// Test-only PDO-compatible adapter for environments without pdo_sqlite.
// Executes the actual SQL against libsqlite3; never loaded by production code.
declare(strict_types=1);
function test_sqlite_string(mixed $value):string{return is_string($value)?$value:FFI::string($value);}
final class TestSqlite extends PDO {
    public FFI $ffi;
    public FFI\CData $db;
    private bool $transaction=false;
    public function __construct(string $path=':memory:') {
        $this->ffi=FFI::cdef('typedef struct sqlite3 sqlite3; typedef struct sqlite3_stmt sqlite3_stmt;
            int sqlite3_open(const char*,sqlite3**); int sqlite3_close(sqlite3*);
            int sqlite3_exec(sqlite3*,const char*,void*,void*,char**);
            int sqlite3_prepare_v2(sqlite3*,const char*,int,sqlite3_stmt**,const char**);
            int sqlite3_step(sqlite3_stmt*); int sqlite3_finalize(sqlite3_stmt*);
            int sqlite3_bind_null(sqlite3_stmt*,int); int sqlite3_bind_int64(sqlite3_stmt*,int,long long);
            int sqlite3_bind_double(sqlite3_stmt*,int,double); int sqlite3_bind_text(sqlite3_stmt*,int,const char*,int,void*);
            int sqlite3_column_count(sqlite3_stmt*); const char* sqlite3_column_name(sqlite3_stmt*,int);
            int sqlite3_column_type(sqlite3_stmt*,int); long long sqlite3_column_int64(sqlite3_stmt*,int);
            double sqlite3_column_double(sqlite3_stmt*,int); const unsigned char* sqlite3_column_text(sqlite3_stmt*,int);
            long long sqlite3_last_insert_rowid(sqlite3*); int sqlite3_changes(sqlite3*); const char* sqlite3_errmsg(sqlite3*);','libsqlite3.so');
        $ptr=$this->ffi->new('sqlite3*[1]');
        if($this->ffi->sqlite3_open($path,$ptr)!==0) throw new RuntimeException('SQLite open failed');
        $this->db=$ptr[0];$this->exec('PRAGMA foreign_keys=ON');
    }
    public function error(): never {throw new RuntimeException(test_sqlite_string($this->ffi->sqlite3_errmsg($this->db)));}
    public function exec(string $statement): int|false {
        $code=$this->ffi->sqlite3_exec($this->db,$statement,null,null,null);
        if($code!==0)$this->error();
        if(preg_match('/^\s*BEGIN\b/i',$statement))$this->transaction=true;
        if(preg_match('/^\s*(COMMIT|ROLLBACK)\b/i',$statement))$this->transaction=false;
        return $this->ffi->sqlite3_changes($this->db);
    }
    public function prepare(string $query,array $options=[]): PDOStatement|false {return new TestSqliteStatement($this,$query);}
    public function query(string $query,?int $fetchMode=null,mixed ...$fetchModeArgs):PDOStatement|false {$s=$this->prepare($query);$s->execute();return $s;}
    public function lastInsertId(?string $name=null):string|false{return (string)$this->ffi->sqlite3_last_insert_rowid($this->db);}
    public function inTransaction():bool{return $this->transaction;}
    public function beginTransaction():bool{$this->exec('BEGIN');return true;}
    public function commit():bool{$this->exec('COMMIT');return true;}
    public function rollBack():bool{$this->exec('ROLLBACK');return true;}
    public function __destruct(){if(isset($this->db))$this->ffi->sqlite3_close($this->db);}
}
final class TestSqliteStatement extends PDOStatement {
    private FFI\CData $stmt; private array $result=[]; private int $position=0; private int $changed=0;
    private array $buffers=[];
    public function __construct(private TestSqlite $connection,string $sql) {
        $ptr=$connection->ffi->new('sqlite3_stmt*[1]');
        if($connection->ffi->sqlite3_prepare_v2($connection->db,$sql,-1,$ptr,null)!==0)$connection->error();
        $this->stmt=$ptr[0];
    }
    public function execute(?array $params=null):bool {
        $ffi=$this->connection->ffi;$this->buffers=[];
        foreach(array_values($params??[]) as $index=>$value){$i=$index+1;
            if($value===null)$code=$ffi->sqlite3_bind_null($this->stmt,$i);
            elseif(is_int($value)||is_bool($value))$code=$ffi->sqlite3_bind_int64($this->stmt,$i,(int)$value);
            elseif(is_float($value))$code=$ffi->sqlite3_bind_double($this->stmt,$i,$value);
            else{$value=(string)$value;$buf=$ffi->new('char['.(strlen($value)+1).']');FFI::memcpy($buf,$value,strlen($value));$this->buffers[]=$buf;$code=$ffi->sqlite3_bind_text($this->stmt,$i,$buf,strlen($value),null);}
            if($code!==0)$this->connection->error();
        }
        $this->result=[];$this->position=0;
        while(($code=$ffi->sqlite3_step($this->stmt))===100){
            $row=[];for($i=0;$i<$ffi->sqlite3_column_count($this->stmt);$i++){
                $type=$ffi->sqlite3_column_type($this->stmt,$i);
                $value=match($type){1=>(int)$ffi->sqlite3_column_int64($this->stmt,$i),2=>(float)$ffi->sqlite3_column_double($this->stmt,$i),3,4=>test_sqlite_string(FFI::cast('char*',$ffi->sqlite3_column_text($this->stmt,$i))),default=>null};
                $row[test_sqlite_string($ffi->sqlite3_column_name($this->stmt,$i))]=$value;
            }$this->result[]=$row;
        }
        if($code!==101)$this->connection->error();
        $this->changed=$ffi->sqlite3_changes($this->connection->db);
        return true;
    }
    public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed{return $this->result[$this->position++]??false;}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{$rows=array_slice($this->result,$this->position);$this->position=count($this->result);return $rows;}
    public function fetchColumn(int $column=0):mixed{$row=$this->fetch();return $row===false?false:(array_values($row)[$column]??false);}
    public function rowCount():int{return $this->changed;}
    public function __destruct(){$this->connection->ffi->sqlite3_finalize($this->stmt);}
}
