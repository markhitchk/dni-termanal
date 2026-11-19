<?php
declare(strict_types=1);

/**
 * Contributions-first Treasury module for DNI Operations.
 * No live-game wallet access, automatic transfer, funding request approval,
 * campaign spending, or presumed owner/Logistics financial authority.
 *
 * Must be used inside DniOperations so all identities/authorizations come
 * from the canonical DNI store and transactional write() framework.
 */
trait DniOperationsTreasury
{
    private static function treasurySchema(PDO $pdo): void
    {
        $sql = file_get_contents(DNI_ROOT . '/database/migrations/019_dni_ops_treasury.sql');
        if ($sql === false) throw new RuntimeException('Treasury migration is missing.', 503);
        $checksum = hash('sha256', $sql);
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->exec('CREATE TABLE IF NOT EXISTS dni_ops_schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
            $statement = $pdo->query('SELECT checksum FROM dni_ops_schema_migrations WHERE version=19');
            $existing = $statement->fetchColumn();
            if ($existing !== false) {
                if (!hash_equals((string)$existing,$checksum)) throw new RuntimeException('Treasury migration checksum mismatch.',503);
                $pdo->exec('COMMIT');
                return;
            }
            $previous = $pdo->query('SELECT 1 FROM dni_ops_schema_migrations WHERE version=18')->fetchColumn();
            if ($previous === false) throw new RuntimeException('Operations schema must be initialized first.',503);
            $partial = $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name LIKE 'dni_ops_treasury_%' LIMIT 1")->fetchColumn();
            if ($partial !== false) throw new RuntimeException('Unversioned Treasury tables detected.',503);
            $pdo->exec($sql);
            $pdo->prepare('INSERT INTO dni_ops_schema_migrations(version,checksum) VALUES(19,?)')->execute([$checksum]);
            $pdo->exec('COMMIT');
        } catch (Throwable $error) {
            try { $pdo->exec('ROLLBACK'); } catch (Throwable $ignored) {}
            throw $error;
        }
    }

    // A Director is not simply any HC-2+ user or site administrator:
    // an explicit existing DNI grant scoped to Engineering or Logistics is required.
    private function treasuryDirector(): bool
    {
        return in_array($this->corp,['engineering','logistics'],true)
            && $this->highCommand(2)
            && $this->grant('operations.treasury.director',$this->corp);
    }

    private function treasuryStaff(): bool
    {
        return $this->one('SELECT 1 FROM dni_ops_treasury_staff WHERE user_id=? AND active=1',[$this->id]) !== null;
    }

    private function treasuryCapability(string $capability): bool
    {
        if (!$this->member($this->user)) return false;
        $director = $this->treasuryDirector();
        $staff = $this->treasuryStaff();
        return match ($capability) {
            'operations.treasury.contribute' => true,
            'operations.treasury.balance.read' => $this->highCommand(2) || $staff || $director,
            'operations.treasury.review' => $staff || $director,
            'operations.treasury.appoint' => $director,
            default => false,
        };
    }

    private function treasuryEvent(string $type, int $id, string $event, array $details=[]): void
    {
        $this->exec('INSERT INTO dni_ops_treasury_events(entity_type,entity_id,actor_user_id,event_type,details_json) VALUES(?,?,?,?,?)',
            [$type,$id,$this->id,$event,json_encode($details,JSON_THROW_ON_ERROR)]);
    }

    private function treasuryRead(): array
    {
        $canSee = $this->can('operations.treasury.balance.read','logistics');
        $canReview = $this->can('operations.treasury.review','logistics');
        $canAppoint = $this->can('operations.treasury.appoint','logistics');
        $own = $this->rows('SELECT id,amount_auec,purpose,reported_reference,public_credit,status,review_note,created_at,reviewed_at FROM dni_ops_treasury_contributions WHERE reported_by=? ORDER BY id DESC LIMIT 100',[$this->id]);
        $credits = $this->rows("SELECT id,reported_by,amount_auec,purpose,created_at FROM dni_ops_treasury_contributions WHERE status='verified' AND public_credit=1 ORDER BY id DESC LIMIT 50");
        foreach ($credits as &$credit) {
            $credit['contributor'] = $this->name((int)$credit['reported_by']);
            unset($credit['reported_by']);
        }
        unset($credit);
        $result = [
            'ok'=>true,
            'myContributions'=>$own,
            'publicCredits'=>$credits,
            'canViewBalance'=>$canSee,
            'canReview'=>$canReview,
            'canAppoint'=>$canAppoint,
            'verifiedTotalAuec'=>null,
            'pendingCount'=>null,
            'reviewQueue'=>[],
            'staff'=>[],
        ];
        if ($canSee) {
            $sum = $this->one("SELECT COALESCE(SUM(amount_auec),0) AS total FROM dni_ops_treasury_contributions WHERE status='verified'");
            $result['verifiedTotalAuec'] = (int)($sum['total']??0);
        }
        if ($canReview) {
            $row=$this->one("SELECT COUNT(*) AS total FROM dni_ops_treasury_contributions WHERE status='pending'");
            $result['pendingCount']=(int)($row['total']??0);
            $result['reviewQueue']=$this->rows("SELECT * FROM dni_ops_treasury_contributions ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,id DESC LIMIT 200");
            foreach ($result['reviewQueue'] as &$contribution) {
                $contribution['contributor']=$this->name((int)$contribution['reported_by']);
            }
            unset($contribution);
        }
        if ($canAppoint) {
            $result['staff']=$this->rows('SELECT user_id,active,payment_limit_auec,appointed_by,updated_at FROM dni_ops_treasury_staff ORDER BY user_id');
            foreach ($result['staff'] as &$row) $row['name']=$this->name((int)$row['user_id']);
            unset($row);
        }
        return $result;
    }

    private function treasuryContribute(array $b): array
    {
        $this->requireCap('operations.treasury.contribute','logistics');
        $amount = self::integer($b['amountAuec']??null,1,2147483647);
        $purpose = self::text($b['purpose']??'',300);
        $reference = self::text($b['reportedReference']??'',200);
        $optIn = $b['publicCredit']??false;
        if (!is_bool($optIn)) throw new RuntimeException('Contributor visibility must be explicit.',422);
        $id = $this->insert("INSERT INTO dni_ops_treasury_contributions(reported_by,amount_auec,purpose,reported_reference,public_credit) VALUES(?,?,?,?,?)",
            [$this->id,$amount,$purpose,$reference,$optIn?1:0]);
        $this->treasuryEvent('contribution',$id,'submitted',['amountAuec'=>$amount,'publicCredit'=>$optIn]);
        $this->audit('operations.treasury.contribute','treasury_contribution',$id,['status'=>'pending']);
        return ['contributionId'=>$id,'status'=>'pending'];
    }

    private function treasuryReview(array $b): array
    {
        $this->requireCap('operations.treasury.review','logistics');
        $id = self::integer($b['id']??null,1);
        $status = self::choice($b['status']??null,['verified','rejected']);
        $row = $this->one('SELECT * FROM dni_ops_treasury_contributions WHERE id=?',[$id]);
        if (!$row) throw new RuntimeException('Contribution not found.',404);
        if ($row['status']!=='pending') throw new RuntimeException('Contribution is already reviewed.',409);
        if ((int)$row['reported_by']===$this->id) throw new RuntimeException('An independent staff reviewer is required.',403);
        $note = self::text($b['note']??'',500,$status==='rejected');
        $reference = self::text($b['verifiedReference']??'',200,$status==='verified');
        $changed=$this->exec("UPDATE dni_ops_treasury_contributions SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=?,verified_reference=? WHERE id=? AND status='pending'",
            [$status,$this->id,$note,$reference,$id]);
        if ($changed!==1) throw new RuntimeException('Contribution already changed.',409);
        $this->treasuryEvent('contribution',$id,$status,['reviewer'=>$this->id]);
        $this->audit('operations.treasury.review','treasury_contribution',$id,['status'=>$status]);
        return ['contributionId'=>$id,'status'=>$status];
    }

    private function treasurySetStaff(array $b): array
    {
        $this->requireCap('operations.treasury.appoint','logistics');
        $id=self::integer($b['userId']??null,1);
        $active=$b['active']??null;
        if (!is_bool($active)) throw new RuntimeException('Staff status must be explicit.',422);
        $limit=self::integer($b['paymentLimitAuec']??0,0,2147483647);
        $person=$this->person($id);
        if (!$this->member($person) || dni_is_citizen_user($person)) throw new RuntimeException('An active DNI member is required.',403);
        $old=$this->one('SELECT * FROM dni_ops_treasury_staff WHERE user_id=?',[$id]);
        if ($old===null && !$active) throw new RuntimeException('Treasury staff appointment not found.',404);
        $this->exec('INSERT INTO dni_ops_treasury_staff(user_id,active,payment_limit_auec,appointed_by) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET active=excluded.active,payment_limit_auec=excluded.payment_limit_auec,appointed_by=excluded.appointed_by,updated_at=CURRENT_TIMESTAMP',
            [$id,$active?1:0,$limit,$this->id]);
        $event= !$active ? 'revoked' : ($old===null ? 'appointed' : 'updated');
        $this->treasuryEvent('staff',$id,$event,['paymentLimitAuec'=>$limit,'active'=>$active]);
        $this->audit('operations.treasury.staff.set','treasury_staff',$id,['active'=>$active]);
        return ['staffUserId'=>$id,'active'=>$active,'paymentLimitAuec'=>$limit];
    }
}
