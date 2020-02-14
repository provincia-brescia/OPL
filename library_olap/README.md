A simple OLAP compatible with the Clavis database (Library Management System)

Questo progetto è stato realizzato nell'ambito dell'Avviso OCPA2020 (Open Community PA 2020: primo Avviso pubblico per interventi volti al tresferimento , evoluzione e diffusione di buone prassi fra le Pubbliche Amministrazioni)

Si tratta di un OLAP (On-Line Analytical Processing) realizzato per favorire l'attività di data analysis delle informazioni provenienti dal'LMS (Library Management System) ClavisNG. La sua realizzazine si basa su questi principi:
1. semplicità di realizzazione
2. facilità di impiego
3. versatilità d'uso

1. SEMPLICITA' DI REALIZZAZIONE
L'olap è realizzato attraverso uno script (OLAP.php) che, interpretando le istruzioni contenute nel file di configurazione "olapSettings.json" (di cui questo repository contiene un esempio), accede al database di produzione di ClavisNG, esegue le query prescritte e, ottenuti i risultati, li aggiunge al database OLAP (MySql o MariaDB). 
Lo script è costituito da tre classi:
  * OLAP, incaricata, tramite il metodo "add" dell'aggiunta dei nuovi dati ogni volta che lo script viene eseguito. Interpretando il file di configurazione "olapSettings.json" provvede all'istanzazione di oggetti della classe Table, dedicati all'effettiva alimentazione del db impiegato per l'olap
  * Table, utilizzata per la scrittura dei record nel db attraverso due metodi principali: "InitByQuery" crea nel db la struttura della tabella che accolgierà i dati predisposti dallo script, approntando i campi adatti ai dati ricavati dalla query che interroga il db Clavis; "writeRow" esegue la scrittura dei dati ricavati dalla query. I metodi sono programmati in modo tale da reagire con flessibilità a eventuali modifiche della query utilizzata per eseguire le misure (per esempio, aggiunge "al volo" nuovi campi alla tabella olap già precedentemente predisposta.
  * TimeScope, è una classe "di serivizio", che permette la gestione degli intervalli di tempo fra un'esecuzione dello script e l'altra (si veda il commento al file di configurazione).

Lo script viene eseguito una volta al giorno dal cron del sistema operativo, preferibilmente in un orario nel quale l'atività sul database di produzione è limitata (le ore notturne); ciò per non aggravere il carico del serer sul quale il db è istanzato ma anche per assicurare che i dati registrati nell'olap siano, rispetto alla giornata di servizio delle biblioteche, consolidati.

2. FACILITA' DI IMPIEGO
In sostanza tutta l'attività è svolta da un unico script.
E' sufficiente copiarlo su di un server che possa accedere al db utilizzato da ClavisNG e che abbia accesso al DBMS che contiene l'olap, configurare appropriatamente il file olapSettins.json, aggiungere l'esecuzione dello script nella crontab del server e il gioco è fatto!

3. VERSATILITA' D'USO
Compilare il file di configurazione olapSettings.json richiede la conoscenza della struttura del db Clavis. E' infatti necessario predisporre le query che ricavano le misure richieste e tali misure sono, perlopiù, ottenibili mediante l'aggregazione di dati presenti nel db di produzione.
Alcune note su come il file di configurazione è costruito:
 * innanzittutto il file json è costituito da un array di "fatti", ossia dei fenomeni dei quali vogliamo raccogliere informazioni
 * ogni fatto ha un 
   - "name", che lo identifica univocamente
   - "label", che esprime in un formato "human readable" il significato dei dati raccolti
   - "info", che aggiunge informazioni utili alla decifrazione della configurazione
   - "cron", che indica ogni quanto il "fatto" deve essere misurato. Assume i volori: "daily", "weekly", "monthly", "yearly"
   - "fact_queries", che elenca le query da eseguire per ricavare le misure relative al "fatto". Ogni "fact query" contiene:
    * "query_id": un identificatore numerico univocoper ognuna delle fact queries
    * "enable": flag di abilitazione; se 0 il "fatto" non viene misurato
    * "info": commento alla query
    * "query": attraverso due campi indica la query da eseguire. Il primo campo ("type") configura il tipo di query utilizzabile. Perlopiù assume il valore "sql" ma è possible utilizzare anche il valore "script"; in questo caso OLAP.php interpreterà ciò che è indicato nel campo "value" come un comando da eseguire tramite una chiamata al sistema operativo. Si noti che le query sql ricevono, tramite il parametro "@data", la data corrente di esecuzione: ciò è necessario per interrogare appropriatamente il db Clavis.

A scopo esemplificativo segue il commento della query utilizzata per l'estrazione degli utenti attivi
 SELECT 
  preferred_library_id AS libraryId, // biblioteca preferita dall'utente
  CASE WHEN gender = 'O' THEN 'n/a' 
  WHEN YEAR(@date) - YEAR(birth_date) >= 61 THEN '61+' WHEN YEAR(@date) - YEAR(birth_date) >= 41 THEN '41-60' 
  WHEN YEAR(@date) - YEAR(birth_date) >= 26 THEN '26-40' WHEN YEAR(@date) - YEAR(birth_date) >= 16 THEN '15-25' 
  WHEN YEAR(@date) - YEAR(birth_date) >= 0 THEN '0-14' 
  ELSE 'n/a' END AS ageGroup, // suddivisione degli utenti per fasce d'età
  COUNT(*) AS value 
  FROM patron 
  WHERE (card_expire > DATE_SUB(@date, INTERVAL 12 MONTH) OR DATE(last_seen) > DATE_SUB(@date, INTERVAL 12 MONTH)) 
  GROUP BY preferred_library_id , ageGroup" // attraverso il parametro @date si individuano gli utenti che hanno rinnovato la tessera di iscrizione prima di un anno da oggi
  
OLAP.php aggiunge automaticamente alcune informazioni a quelle esplicitamente ricavate dalla query: riguardano l'anno, il mese, la settimana e il giorno (a partire dall'inizio dell'anno) a cui il singolo record si riferisce. OLAP aggiunge automaticamente alla l'id della query che ha generato il dato.
