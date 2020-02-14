var apiBase = 'https://biblioapi.provincia.brescia.it/BSO/';

function cachedFetch(url) {
  /*  var cache = CacheService.getScriptCache();
    var cached = cache.get(url);
    if (cached != null) {
        return JSON.parse(cached);
    } */
    var result = UrlFetchApp.fetch(url);
   /* try {
        cache.put(url, result, 120);
    } catch (e) {
        console.error(e);
    } */

    return JSON.parse(result);

}

function fact_dimensions(fact_name) {
    return cachedFetch(apiBase.concat(fact_name, '/dimensions'));
}

function fact_measures(fact_name) {
    return cachedFetch(apiBase.concat(fact_name, '/measures'));
}

function getAuthType() {
    var response = { type: 'NONE' };
    return response;
}

function getConfig(request) {
//    request = {languageCode: 'it'};
    console.info(request);
    var cc = DataStudioApp.createCommunityConnector();
    config = cc.getConfig();
    var i;
    var options = new Array();

    // Fetch and parse fact tables from API
    var parsedResponse = cachedFetch(apiBase.concat('fact_tables'));

    for (i = 0; i < parsedResponse.length; i++)
        options.push(config.newOptionBuilder()
                .setValue(parsedResponse[i].name)
                .setLabel(parsedResponse[i].label)
    );

    config.newInfo()
        .setId('Istruzioni')
        .setText('Connect to \'Biblioteche della Provincia di Sondrio\' olap data source');


    var cnss = config.newSelectSingle()
        .setId('selectSource')
        .setName('Select library olap source fact')
        .setAllowOverride(false);

    for (i = 0; i < options.length; i++)
        cnss.addOption(options[i]);

    config.setDateRangeRequired(true);

    return config.build();
}

function extractDimensions(dimension) {
    var i, ii;
    var dim;
    var ret_value = [];
    var level;

    var attributes = function (attr_array) {
        var retv = [];
        var j;

        for (j = 0; j < attr_array.length; j++)
            retv.push(attr_array[j]);

        return retv;
    }

    for (i = 0; i < dimension.length; i++) {

        dim = dimension[i];
        if (typeof dim.levels === 'undefined')
            ret_value.push(typeof dim.attributes === 'undefined' ? dim.name : attributes(dim.attributes));
        else if (dim.name == 'date')
            ret_value.push('date');
        else {

            for (ii = 0; ii < dim.levels.length; ii++) {

                level = dim.levels[ii];
                if (typeof level.attributes === 'undefined')
                    ret_value.push(level.name);
                else
                    ret_value.push.apply(ret_value, attributes(level.attributes));

            }
        }
    }

    return ret_value;

}


function getFields(request) {
    console.info(request);
    //  var request = {configParams : {selectSource:'loans2'}};
    var cc = DataStudioApp.createCommunityConnector();
    var fields = cc.getFields();
    var types = cc.FieldType;
    var aggregations = cc.AggregationType;
    var i, dim;


    var dimension_array = [];
    dimension_array = extractDimensions(fact_dimensions(request.configParams.selectSource));

    for (i = 0; i < dimension_array.length; i++) {
        dim = dimension_array[i];
        var test = dim == 'date';
        fields.newDimension()
            .setId(dim)
            .setType(dim == 'date' ? types.YEAR_MONTH_DAY : types.TEXT);
    }

    var measure, f_measures = fact_measures(request.configParams.selectSource);
    for (i = 0; i < f_measures.length; i++) {
        measure = f_measures[i];
        fields.newMetric()
            .setId(measure.name)
            .setType(types.NUMBER)
            .setAggregation(measure.aggregate == 'sum' ? aggregations.SUM : aggregations.COUNT);
    }

    /* fields.newDimension()
       .setId('data_studio_connector_day')
       .setType(types.YEAR_MONTH_DAY);  */

    return fields;
}

function getSchema(request) {
    // var request = {configParams : {selectSource:'enabled_users'}};
    console.info(request);

    var fields = getFields(request).build();
    return { schema: fields };
}

function responseToRows(requestedFields, response) {
  var responseTitle = response[0];
  var fields = [];
  
  var requestedFieldsAsArray = requestedFields.asArray();
  var dateIdx = -1;
  requestedFieldsAsArray.forEach (function (field, index) {
    var fName = field.getId();
    if (fName == 'date') {fName = 'day', dateIdx = index}
    fields.push( {name : fName, type : field.getType()} );}
  );
  
  var indexFieldsToKeep = [];
  responseTitle.forEach (function (value, index) {if ((fieldsIdx = fields.map(function(item) { return item.name;}).indexOf(value)) != -1) indexFieldsToKeep[fieldsIdx] = index;});
    
  var clearResponse = [];
  response.forEach (function (value, index) {
      if (index == 0) return;
      var record = [];
      value.forEach (function (item, idx) {
      if ((idxToKeep = indexFieldsToKeep.indexOf(idx)) != -1) {
          var val = dateIdx == -1 || dateIdx != idxToKeep ? item : item.replace (/-/g, '');
          record[idxToKeep] = fields[idxToKeep].type == 'TEXT' ? String(val) : val;
         }
      });
      clearResponse.push({values : record});
    });
    
  return clearResponse;
    
    
  
  
  /*  var isInArray = function (value, array) {
        return array.indexOf(value) > -1;
    }

    var transformDate = function (strDate) {
        var date = new Date(strDate);
        return date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2);
    }

    // Transform parsed data and filter for requested fields
    return response.map(function (singleResponse) {
        var row = [];
        var requestedFieldsAsArray = requestedFields.asArray();
        requestedFieldsAsArray.forEach(function (field) {
            var fieldValue = field.getId();
            var fieldType = field.getType();

          for (var prop in singleResponse) {
            //  var test = singleResponse[prop];
            //if (prop == 'empty_dataset')
            //  return row.push(0);
            if (prop == 'measures' && typeof singleResponse[prop] !== 'object') {
              return row.push(singleResponse[prop]);
            } else if (typeof singleResponse[prop] === 'object') {
              var subprop;
              for (subprop in singleResponse[prop])
                if (subprop == fieldValue)
                  if (fieldType == 'TEXT')
                    return row.push(String(singleResponse[prop][subprop]));
              else
                return row.push(singleResponse[prop][subprop]);
            } else {
              if (fieldValue == 'date' && isInArray(prop, ['day', 'week', 'month', 'year']))
              return row.push(transformDate(singleResponse[prop]));
              else if (prop == fieldValue) {
                if (fieldType == 'TEXT')
                  return row.push(String(singleResponse[prop]));
                else
                  return row.push(singleResponse[prop]);
              }
            }
            
          }
            
        });
        return { values: row };
    });*/
}

function getData(request) {
    console.info(request);
    // var request = {configParams: {selectSource: 'loans2'}, dateRange: {endDate: '2019-05-22', startDate: '2019-04-25'}, scriptParams: {lastRefresh: 1558571475804}, fields: [{name: 'consortia_id'}, {name: 'localLoans'}, {name: 'month'}, {name: 'year'}]};
    //var request = {configParams: {selectSource: 'loans2'}, dateRange: {endDate: '2019-05-23', startDate: '2019-04-26'}, fields: [{name: 'consortia_id'}, {name: 'localLoans'}]};
    //  var request = {configParams: {selectSource: 'loans2'}, dateRange: {endDate: '2019-05-23', startDate: '2019-04-26'}, scriptParams: {lastRefresh: 1558648712437}, fields: [{name: 'consortia_id'}, {name: 'consortia_label'}, {name: 'date'}, {name: 'library_id'}, {name: 'localLoans'}]};
    //  var request = {configParams: {selectSource: 'loans2'}, dateRange: {endDate: '2018-12-31', startDate: '2018-01-01'}, fields: [{name: 'consortia_label'}, {name: 'loanOut'}, {name: 'localLoans'}]};
    // var request = {configParams:{selectSource:'loans2'}, dateRange:{endDate: '2019-05-25', startDate: '2019-04-28'}, fields: [{name: 'date'}, {name: 'localLoans'}]};
     // var request = {configParams: {selectSource: 'enabled_users'}, dateRange:{endDate:'2019-05-29', startDate:'2019-05-02'}, scriptParams:{lastRefresh:1559235685233}, fields:[{name:'consortia_id'}, {name:'patron_count'}]};
    //var request = {configParams:{selectSource:'enabled_users'}, dateRange:{endDate:'2019-05-30', startDate:'2019-05-03'}, fields:[{name:'consortia_id'}, {name:'patron_count'}]};
    //  var request = {configParams:{selectSource:"general_indexes"}, dateRange:{endDate:"2019-06-06", startDate:"2019-05-10"}, scriptParams:{lastRefresh:1559897890812}, fields:[{name:"apertura_mattutina"}, {name:"date"}, {name:"library_class"}]};
     // var request = {pagination:{startRow: 1.0, rowCount: 100.0}, configParams:{selectSource:'general_indexes'}, dateRange:{endDate:'2019-02-10', startDate:'2019-06-10'}, scriptParams:{sampleExtraction:true}, fields:[{name:'apertura_mattutina'}, {name:'apertura_pomeridiana'}]};
    // var request = {configParams:{selectSource:'patrimonio'}, dateRange:{endDate:'2019-06-16', startDate:'2019-05-20'}, fields:[{name:'consortia_id'}, {name:'value'}]};
    // var request = {configParams:{selectSource:'patrimonio'}, dateRange:{endDate:'2019-05-16', startDate:'2019-06-16'}, fields:[{name:'data_pubblicazione'}]};
    // var request = {configParams:{selectSource: 'patrimonio'}, dateRange:{endDate: '2019-08-18', startDate: '2019-07-22'}, fields:[{name: 'consortia_id'}, {name: 'value'}]};
  //  var request = {configParams:{selectSource:'general_indexes'}, dateRange:{endDate: '2019-09-01', startDate:'2019-08-05'}, fields:[{name: 'consortia_label'}, {name: 'library_id'}, {name:'library_type'}]};
  	//var request = {configParams:{selectSource:'general_indexes'}, dateRange:{endDate:'2019-09-02', startDate:'2019-08-06'}, fields:[{name:'consortia_label'}, {name:'library_class'}, {name:'library_id'}, {name:'library_type'}]};
    // var request = {configParams:{selectSource:'general_indexes'}, dateRange:{endDate:'2019-09-02', startDate:'2019-08-06'}, fields:[{name:'apertura_mattutina'}, {name:'consortia_id'}, {name:'date'}]};
  //  var request = {configParams:{selectSource:'enabled_users'}, dateRange:{endDate:'2018-12-31', startDate:'2018-01-01'}, fields:[{name:'age_group'}, {name:'consortia_label'}, {name:'gender_group'}, {name:'library_type'}, {name:'value'}]};
    
    var __startTime = Date.now();
    fact_name = request.configParams.selectSource;

    var requestedFieldIds = request.fields.map(function (field) {
        return field.name;
    });

    var requestedFields = getFields(request).forIds(requestedFieldIds);
    console.info(requestedFields);

    // prepare api url
    var startDate = request.dateRange.startDate;
    var endDate = request.dateRange.endDate;
    startDate = startDate.replace (/-/g, ',');
    endDate = endDate.replace(/-/g, ',');
    
    // prepare drilldown parameters
    var passedFields = request.fields;
    var checkField = function (name) {
        var c;
        for (c = 0; c < passedFields.length; c++)
            if (passedFields[c].name == name)
                return name;
        return null;
    }


    var i, dim;
    var verifyAttributes = function (node) {
        if (typeof node.attributes === 'undefined')
            return checkField(node.name);
        else {
            var a, ret = null;
            for (a = 0; a < node.attributes.length; a++)
                if (ret = checkField(node.attributes[a]))
                    return ret;
        }

    }
    var drillDownArray = [];
    var f_dim = [], verify;
    console.info('before execute fact_dimension:'+ (Date.now()-__startTime));
    f_dim = fact_dimensions(fact_name);
    console.info('execute fact_dimension:'+ (Date.now()-__startTime));

    for (i = 0; i < f_dim.length; i++) {

        dim = f_dim[i];
        if (typeof dim.levels === 'undefined') {
            if (checkField(dim.name))
                drillDownArray.push({ parent_node: null, child_node: dim.name });
            else continue;
        } else if (dim.name == 'date') {
            if (checkField('date'))
                drillDownArray.push({ parent_node: 'date', child_node: 'day' });
        } else {
            for (var l = 0, toPush = null; l < dim.levels.length; l++) {
                verify = verifyAttributes(dim.levels[l]);
                if (verify)
                    toPush = { parent_node: dim.name, child_node: verify };
            }
            if (toPush !== null)
                drillDownArray.push(toPush);
        }
    }

    var drilldown_string = '';
    for (i = 0; i < drillDownArray.length; i++) {
        if (i != 0)
            drilldown_string += '|';
        if (drillDownArray[i].parent_node)
            drilldown_string += drillDownArray[i].parent_node + ':' + drillDownArray[i].child_node;
        else if (drillDownArray[i].child_node == 'date')
            drilldown_string += 'date:day';
        else
            drilldown_string += drillDownArray[i].child_node;

    }
    console.info('prepare DrillDown string:'+ (Date.now()-__startTime));


    // Fetch and parse data from API
    var url = [
        apiBase,
        fact_name,
        '/aggregate?cut=date:',
        startDate,
        '-',
        endDate
    ];
    if (drilldown_string != '') {
        url.push('&drilldown=', drilldown_string);
    }
    url.push('&output=', 'table');
    var str_url = encodeURI(url.join(''));
    // str_url = encodeURI("https://biblioapi.provincia.brescia.it/BSO/enabled_users/aggregate?cut=date:2019,01,01-2019,06,04&drilldown=date:day");

    console.info(str_url);

    var parsedResponse = [], tempParsedResponse = cachedFetch(str_url);
    if (tempParsedResponse instanceof Array)
        parsedResponse = tempParsedResponse;
    else
        parsedResponse[0] = tempParsedResponse;
        
    if (Object.keys(parsedResponse[0])[0] == 'empty_dataset') {
      var idleResponse = {};
      for (var dimension in drillDownArray) {
        idleResponse[drillDownArray[dimension].child_node] = 'null';
      }
      var measures = fact_measures(fact_name);
      var idleMeasures = {};
      for (var m in measures) {
        idleMeasures[measures[m].name] = 0;
      }
      idleResponse['measures'] = idleMeasures;
      parsedResponse[0] = idleResponse;
    }

    var rows = responseToRows(requestedFields, parsedResponse);
    console.info('responseToRows:'+ (Date.now()-__startTime));
//var schema = requestedFields.build();

    var retval = {
        schema: requestedFields.build(),
        rows: rows
    };
    console.info(retval);
    console.info('all execution time (last version):'+ (Date.now()-__startTime));
    
    return retval;
}