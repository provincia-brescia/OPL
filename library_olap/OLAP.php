<?php

class TimeScope {
	private $scope = array();
	private $currentDate;
	private $timeNameEquivalence = array ('yearly'=>'year', 'monthly'=>'month',
										'weekly'=>'week', 'daily'=>'day');

	function __construct ($date)
	{
		$this->scope = $this->makeScope ($date);
		$this->currentDate = $date;
	}

	function getScope ($executionInterval)
	{
		$nextScope = $this->makeScope ($this->currentDate->add(new DateInterval('P1D')));

		if ($nextScope[$this->timeNameEquivalence[$executionInterval]]
								!= $this->scope[$this->timeNameEquivalence[$executionInterval]]) {
			$nullificator = FALSE;
			foreach ($this->timeNameEquivalence as $t => $t1) {
				if ($nullificator == TRUE)
					$this->scope[$t1] = NULL;
				if ($t == $executionInterval)
					$nullificator = TRUE;
			}
			return $this->scope;
		} else
			return NULL;

	}

	private function makeScope ($date)
	{
		$scope = array();

		$scope['year'] = $date->format('Y');
		$scope['month'] = $date->format('m');
		$scope['week'] = 'Y'.$date->format('o').'-W'.$date->format('W');
		$scope['day'] = $date->format('z')+1;

		return $scope;
	}
}

class Table {
	private $type;
	private $db, $stmt;
	private $tableStruct = array();
	private $assocDataTyes = array(
		'STRING' => array ('dbType' => 'CHAR(12)', 'structType' => 'STRING'),
		'LONG' => array ('dbType' => 'INT(11)', 'structType' => 'LONG'),
		'VAR_STRING' => array ('dbType' => 'VARCHAR(50)', 'structType' => 'VAR_STRING'),
		'DATETIME' => array ('dbType' => 'DATETIME', 'structType' => 'DATETIME'),
		'LONGLONG' => array ('dbType' => 'INT(21)', 'structType' => 'LONG'),
		'NEWDECIMAL' => array ('dbType' => 'INT(21)', 'structType' => 'LONG')
	);

	function __construct ($db = NULL)
	{
		if ($db == NULL)
			$this->type = 'script';
		else {
			$this->db = $db;
			$this->type = 'sql';
		}
	}

	private $externalJson;
	private $externalJsonIndex = 0;

	function initByScript ($script)
	{
		$externalJsonString = exec ($script);
		$this->externalJson = json_decode ($externalJsonString);

		$this->retrieveTableStructure();
	}

	function initByQuery ($query)
	{
		$this->stmt = $this->db->prepare($query);
	    if ($this->stmt->execute() == FALSE)
			return FALSE;

		$this->retrieveTableStructure();
		return TRUE;
	}

	function getNextRow ()
	{
		if ($this->type == 'sql')
			return $this->stmt->fetch(PDO::FETCH_ASSOC);
		else if ($this->type == 'script') {
			if ($this->externalJsonIndex < count($this->externalJson))
				return (array) $this->externalJson[$this->externalJsonIndex++];
			else
				return FALSE;
		}

	}

	function initByName ($name, $clavisTableStruct, $additionalFields)
	{
		$testQuery = "select * from ".$name." limit 1";
		try {
			$this->stmt = $this->db->prepare($testQuery);
			if ($this->stmt->execute() == FALSE) {
				if ($this->createTable ($name, $clavisTableStruct, $additionalFields) == FALSE)
					return FALSE;

				$this->initByName ($name, $clavisTableStruct, $additionalFields);
			} else	{
				$this->retrieveTableStructure();
				$this->addAdditionalFields($clavisTableStruct, $additionalFields);
				if ($this->tableStruct != $clavisTableStruct)
					$this->modifyTableStruct ($name, $clavisTableStruct);
			}
		}  catch (PDOException $e) {
			echo $e->getMessage();
		}
		return TRUE;
	}

	private $bindVariables = array();

	function prepareWriting ($name)
	{
		$tmp = '';
		$ct = 0;
		foreach ($this->tableStruct as $key => $e)
			$tmp .= $key. ($ct++ < count($this->tableStruct)-1 ? ", " : "");

		$tmp1 = '';
		$ct = 0;
		foreach ($this->tableStruct as $key => $e)
			$tmp1 .= ":".$key. ($ct++ < count($this->tableStruct)-1 ? ", " : "");

		$sql = "INSERT INTO $name ($tmp) VALUES ($tmp1)";

		$this->stmt = $this->db->prepare($sql);

		foreach ($this->tableStruct as $key => $e)
			$this->bindVariables[$key] = 0;

		foreach ($this->bindVariables as $key => &$e) {
			$this->stmt->bindParam (":$key", $e);
		}

	}

	function writeRow ($r, $additionalFields)
	{
		$this->addAdditionalFields ($r, $additionalFields);

		foreach ($r as $ckey => $ce)
			foreach ($this->bindVariables as $okey => &$oe)
				if ($ckey == $okey)
					$oe = $ce;

		if (!$this->stmt->execute())
			echo "Error on writing row\n";
	}

	function alreadyExecuted ($id, $scope, $name)
	{
		$sql = "select count(*) as ct from $name where queryId = $id and
									year = ".$scope['year']." and month = ".$scope['month'].
									" and week = '".$scope['week']."' and day = ".$scope['day'];
		if (($retval = $this->db->query($sql)) == FALSE)
			return FALSE;
		else
			return $retval->fetch()['ct'] > 0 ? TRUE : FALSE;
	}

	private function modifyTableStruct ($name, $cs)
	{
		$oldckey = NULL;
		foreach ($cs as $ckey => $ce) {
			foreach ($this->tableStruct as $okey => $oe)
				if ($okey == $ckey) {
					if ($oe == $ce)
						break;
					else {

						$sql = "ALTER TABLE $name CHANGE COLUMN $okey $okey ".
							$this->getVarDataType($ce). " NULL DEFAULT NULL";

						$this->db->query($sql);
					}
				}
			if ($okey != $ckey) {
				$sql = "ALTER TABLE $name ADD COLUMN $ckey ".$this->getVarDataType($ce). " NULL". 		($oldckey == NULL ? " FIRST\n" : " AFTER $oldckey\n");
				$this->db->query($sql);
			}
			$oldckey = $ckey;
		}
	}

	private function addAdditionalFields(&$source, $additionalFields)
	{
		if ($additionalFields != NULL)
			$source = $additionalFields + $source;
	}

	private function createTable ($name, $tableStruct, $additionalFields)
	{
		$tmp = '';
		if ($additionalFields != NULL)
			foreach ($additionalFields as $key => $e)
				$tmp .= "`".$key."` ".$this->getVarDataType($e)." NULL,\n";

		$ct = 0;
		foreach ($tableStruct as $key => $e) {
			$tmp .= "`".$key."` ".$this->getVarDataType($e)." NULL";
			$tmp .= $ct < count($tableStruct)-1 ? ",\n" : "\n";
			$ct++;
		}

		$sql = "CREATE TABLE ".$name." (".$tmp.")";

		return $this->db->query($sql);

	}

	private function getVarDataType ($v)
	{
		foreach ($this->assocDataTyes as $key => $a)
			if ($key == $v)
				return $a['dbType'];
		return NULL;
	}

	private function getStructType ($v)
	{
		foreach ($this->assocDataTyes as $key => $a)
			if ($key == $v)
				return $a['structType'];
		return NULL;
	}

	private function retrieveTableStructure ()
	{
		if ($this->type == 'sql') {
			$i = 0;
			while (($meta = $this->stmt->getColumnMeta($i++)) != FALSE) {

				$this->tableStruct[$meta['name']] = $this->getStructType($meta['native_type']);
			}
		} else if ($this->type == 'script') {
			foreach ($this->externalJson[0] as $key => $value) {
				$typeOfData = gettype($value);
				// mappa $typeOfData applicando la stessa convenzione della getColoumnMeta
				switch ($typeOfData) {
					case 'integer':
						$typeOfData = 'LONG';
						break;
					case 'string':
						if ($this->isDate ($value) == TRUE)
							$typeOfData = 'DATETIME';
						else
							$typeOfData = 'STRING';
						break;
					default:
						$typeOfData = 'STRING';
				}

				$this->tableStruct[$key] = $this->getStructType($typeOfData);
			}

		}
	}

	private function isDate($value)
	{
		if (!$value)
			return FALSE;
		try {
			new DateTime($value);
			return TRUE;
		} catch (Exception $e) {
			return FALSE;
		}
	}

	function getTableStruct ()
	{
		return $this->tableStruct;
	}
}

class OLAP {
	private $dbClavis, $pivotDate, $fact_name;

	function __construct ($date, $fact_name)
	{
		$this->fact_name = $fact_name;
		$this->pivotDate = $date;
		$this->settings = json_decode (file_get_contents ('config.json'));
	}

	function add ()
	{
		try {
			$dbOlap = new PDO($this->settings->dsnOlap, $this->settings->usernameOlap,
											$this->settings->passwordOlap);
										} catch (Exception $e) {
			echo 'Caught exception: ',  $e->getMessage(), "\n";
			exit;
		}
		$dbOlap->setAttribute(PDO::ATTR_TIMEOUT, 300);

		$dbClavis = new PDO($this->settings->dsnClavis, $this->settings->usernameClavis,
			$this->settings->passwordClavis);

		if (($olapSettings = json_decode (file_get_contents ($this->settings->olapSettingsFile)))
				== NULL)
			throw new Exception ("Wrong olapSettings file.");

		foreach ($olapSettings->fact_tables as $oSettings) {
			if ($this->fact_name && $oSettings->name != $this->fact_name)
				continue;

			$date = new DateTime ($this->pivotDate);
			$timeScope = new TimeScope ($date);

			if (($scp = $timeScope->getScope($oSettings->cron)) != NULL) {

				echo "Execute $oSettings->name ($oSettings->info) --- $this->pivotDate\n";
				foreach ($oSettings->fact_queries as $fq)
					if ($fq->enable == 1)	{
						echo "\t\t$fq->info \n";
						if ($fq->query->type == 'sql') {

							$tableSource = new Table ($dbClavis);

							$query = str_replace("\r", "", $fq->query->value);
							$query = str_replace('@date', "'".$this->pivotDate."'", $query);
							if ($tableSource->initByQuery ($query) == FALSE) {
								echo "Error: failure on init table by query:\n$query\n";
								exit;
							}
						} else if ($fq->query->type == 'script') {

							$tableSource = new Table;
							$script = $fq->query->value." ".$this->pivotDate;
							$tableSource->initByScript ($script);
						} else
							throw Exception ("Invalid query type.");

						$tableOlap = new Table ($dbOlap);
						$queryId = $fq->query_id;
						$tableName = $oSettings->name;
						if ($tableOlap->alreadyExecuted($queryId, $scp, $tableName) != TRUE) {
							$additionalFields = array ('queryId'=>'LONG', 'year'=>'LONG',
														'month'=>'LONG', 'week'=>'STRING',
														'day'=>'LONG',						'executionDate'=>'DATETIME');
							if ($tableOlap->initByName ($tableName,
															$tableSource->getTableStruct(),
															$additionalFields) == FALSE) {
								echo "Error: failure on $tableName creation\n";
								exit;
							}

							$tableOlap->prepareWriting($tableName);
							$additionalFields['queryId'] = $queryId;
							$additionalFields['year'] = $scp['year'];
							$additionalFields['month'] = $scp['month'];
							$additionalFields['week'] = $scp['week'];
							$additionalFields['day'] = $scp['day'];
							$additionalFields['executionDate'] = date('c');
							while (($row = $tableSource->getNextRow()) != FALSE) {
								$tableOlap->writeRow($row, $additionalFields);
							}
						}
					}
			}
		}
	}
}

// Start ------------------------

$usage = "Uso: OLAP -c <add | delete> -d <date>\n -f <fact name>";

try {
	$options = getopt("c:d:f:");
	if ($options == NULL) {
		echo $usage;
		return;
	}
	if ($options['c'] != 'add') {
		echo $usage;
		return;
	}
	$date = $options['d'];
	if (validateDate($date) == FALSE) {
		echo $usage;
		return;
	}
	
	$fact_name = isset($options['f']) ? $options['f'] : NULL;

	try {
		$o = new OLAP($date, $fact_name);
		$o->add();
	} catch (Exception $ee) {
		echo $ee->getMessage()."\n\n";
	}

} catch (PDOException $e) {
    echo 'Connection failed: ' . $e->getMessage();
}

function validateDate($date)
{
    $d = DateTime::createFromFormat('Y-m-d', $date);
    return $d && $d->format('Y-m-d') === $date;
}

?>
