/**
 * Output widget for visualization of genome annotation.
 * @author Roman Sutormin <rsutormin@lbl.gov>
 * @public
 */

define (
    [
        'kbwidget',
        'bootstrap',
        'jquery',
        'bluebird',
        'narrativeConfig',
        'ContigBrowserPanel',
        'util/string',
        'kbaseAuthenticatedWidget',
        'kbaseTabs',
        'jquery-dataTables',
        'jquery-dataTables-bootstrap',
        'GenomeAnnotationAPI-client-api',
        'kbaseTable'
    ], function(
        KBWidget,
        bootstrap,
        $,
        Promise,
        Config,
        ContigBrowserPanel,
        StringUtil,
        kbaseAuthenticatedWidget,
        kbaseTabs,
        jquery_dataTables,
        bootstrap,
        gaa,
        kbaseTable
    ) {
    return KBWidget({
        name: "kbaseGenomeAnnotationViewer",
        parent : kbaseAuthenticatedWidget,
        version: "1.0.0",
        ws_id: null,
        ws_name: null,
        token: null,
        width: 1150,
        options: {
            ws_id: null,
            ws_name: null
        },
        loadingImage: Config.get('loading_gif'),
        wsUrl: Config.url('workspace'),
        timer: null,
        lastElemTabNum: 0,

        init: function(options) {
            this._super(options);

            this.content = {};
            this.tableData = {};

            if (this.options.wsNameOrId != undefined) {
              this.wsKey = this.options.wsNameOrId.match(/^\d+/)
                ? 'wsid'
                : 'workspace'
              ;
            }

            if (this.options.objNameOrId != undefined) {
              this.objKey = this.options.objNameOrId.match(/^\d+/)
                ? 'objid'
                : 'name'
              ;
            }


            var $self = this;

            var dictionary_params = {};
            dictionary_params[this.wsKey] = this.options.wsNameOrId;
            dictionary_params[this.objKey] = this.options.objNameOrId;

            this.dictionary_params = dictionary_params;

            this.ref = this.options.wsNameOrId + '/' + this.options.objNameOrId;
            this.genome_api = new GenomeAnnotationAPI(Config.url('service_wizard'), {token : this.authToken() });

            this.appendUI(this.$elem);

            return this;
        },

        loaderElem : function () {
          return $.jqElem('div')
                .append('<br>&nbsp;Loading data...<br>&nbsp;please wait...<br>&nbsp;Data parsing may take upwards of 30 seconds, during which time this page may be unresponsive.')
                .append($.jqElem('br'))
                .append(
                    $.jqElem('div')
                    .attr('align', 'center')
                    .append($.jqElem('i').addClass('fa fa-spinner').addClass('fa fa-spin fa fa-4x'))
                    )
                ;
        },

        appendUI : function($elem) {

            var $self = this;

            var $loaderElem = $self.loaderElem();

            $self.data('loaderElem', $loaderElem);
            $elem.append($loaderElem);

            var $tabElem = $.jqElem('div').css('display', 'none');
            $self.data('tabElem', $tabElem);
            $elem.append($tabElem);

            var $tabObj = new kbaseTabs($tabElem, {canDelete : true});
            $self.data('tabObj', $tabObj);

            $self.genome_api.get_summary($self.ref).then(function (d) {
console.log("RESPONSE IS ", d);

              $self.summary = d;

              var $overviewTableElem = $.jqElem('div');
              var $overviewTable =  new kbaseTable($overviewTableElem, {
                      allowNullRows: false,
                      structure: {
                          keys: [
                            'KBase Object Name',
                            'Scientific name',
                            'Domain',
                            'Genetic Code',
                            'Source',
                            'Source ID',
                            'GC',
                            'Taxonomy',
                            'Size',
                            'Number of Contigs',
                            'Number of Genes'
                          ],
                          rows: {
                            'KBase Object Name' : $self.ref,
                            'Scientific name' : d.taxonomy.scientific_name,
                            'Domain' : d.taxonomy.kingdom,
                            'Genetic Code' : d.taxonomy.genetic_code,
                            'Source' : d.annotation.external_source,
                            'Source ID' : d.assembly.assembly_source_id,
                            'GC' : (Math.round(10000 * d.assembly.gc_content) / 100) + '%',
                            'Taxonomy' : d.taxonomy.scientific_lineage.join('; '),
                            'Size' : d.assembly.dna_size,
                            'Number of Contigs' : d.assembly.contig_ids.length,
                            'Number of Genes' : d.annotation.feature_type_counts.gene,
                          }
                      }
                  }
              );

              $tabObj.addTab(
                { tab : 'Overview', content : $overviewTableElem, canDelete : false, show : true}
              );

              $tabObj.addTab(
                { tab : 'Contigs',  canDelete : false, show : false, dynamicContent : true, showContentCallback : function($tab) {
                  return $self.showContigContent($tab);
                }}
              );

              $tabObj.addTab(
                { tab : 'Genes',canDelete : false, show : false, dynamicContent : true, showContentCallback : function($tab) {
                  return $self.showGeneContent($tab);
                }}
              );

              $loaderElem.hide();
              $tabElem.show();


            })
            .fail(function (d) {
              $self.$elem.empty();
              $self.$elem
                  .addClass('alert alert-danger')
                  .html("Summary object is empty : " + d.error.message);
            });


            return $elem;

        },

        showContigContent : function($tab) {
          return this.showContent('contigs', $tab);
        },

        showGeneContent : function($tab) {
          return this.showContent('genes', $tab);
        },

        showContent : function(type, $tab) {
        console.log("SHOWS CONTENT FOR ", type, " IN ", $tab);

          var genesTable;
          var contigsTable;

          var genesTableElem = $.jqElem('table').css('width', '100%');
          var contigsTableElem = $.jqElem('table').css('width', '100%');

          var populated = {};

          var $self = this;
          if (this.content[type] == undefined) {

            $self.genesData = [];
            $self.contigsData = [];
console.log("STARTS CALLS @", Date.now());
            $self.genome_api.get_feature_locations($self.ref).then(function (features) {
              console.log("GOT FEATURE LOCATIONS", Date.now());
            });

            $self.genome_api.get_feature_types($self.ref).then(function (features) {
              console.log("GOT FEATURE types", Date.now(), features);
            });

            $self.genome_api.get_features($self.ref).then(function (features) {
              console.log("API GET FEATURES ", features, Date.now());

              var geneMap = {};
              var contigMap = {};

              var cdsData = [] //XXX plants baloney. Extra tab for CDS data. See below on line 372 or so.
              var mrnaData = [] //XXX plants baloney. We throw away mrnaData. See below on line 372 or so.

              function geneEvents() {
                  $('.'+pref+'gene-click').unbind('click');
                  $('.'+pref+'gene-click').click(function() {
                      var geneId = [$(this).data('geneid')];
                      showGene(geneId);
                  });
              }

              var genomeType = 'genome'; //self.genomeType(gnm); XXX THIS NEEDS TO BE FIXED TO IDENTIFY TRANSCRIPTOMES AGAIN!
var featurelist = {};
              var pref = 12345;
console.log("PARSED 1");
              $.each(
                features,
                function (feature_id, feature) {
                  if (feature.feature_locations != undefined) {

                    $.each(
                      feature.feature_locations,
                      function (i, contig) {
                        if (contigMap[contig.contig_id] == undefined) {
                          contigMap[contig.contig_id] = {name : contig.contig_id, length : contig.length, genes : []};
                        }
                      }
                    );

                    contigName = feature.feature_locations[0].contig_id;

                    //XXX plants baloney - if it's non plant, it just goes into the genes array.
                    //but if it is plants, then we split it up - same data, two different tabs.
                    //locus data goes on the genes tab, cds data goes on the cds tab.
                    //We're also creating an mrnaData array for mrna data, but we're just throwing that out later.

                    /*var dataArray = [];
                    if ((gnm.domain != 'Plant' && gnm.domain != 'Eukaryota') || gene.type == 'locus') {
                      dataArray = $self.genesData;
                    }
                    else*/

                    var dataArray = [];

                    featurelist[feature.feature_type] = 1;
                    if (feature.feature_type == 'gene') {
                      dataArray = $self.genesData;
                    }
                    if (feature.feature_type == 'CDS') {
                      dataArray = cdsData;
                    }
                    else if (feature.feature_type == 'mRNA') {
                      dataArray = mrnaData;
                    }


                    dataArray.push({
                      // id: '<a href="/#dataview/'+self.ws_name+'/'+self.ws_id+'?sub=Feature&subid='+geneId+'" target="_blank">'+geneId+'</a>',
                      id: '<a class="'+pref+'gene-click" data-geneid="'+feature_id+'">'+feature_id+'</a>',
                      // contig: contigName,
                      contig: '<a class="' + pref + 'contig-click" data-contigname="'+feature.feature_locations[0].contig_id+'">' + feature.feature_locations[0].contig_id + '</a>',
                      start: feature.feature_locations[0].start,
                      dir: feature.feature_locations[0].strand,
                      len: feature.feature_locations[0].length,
                      type: feature.feature_type,
                      func: feature.function || '-'
                    });

                    geneMap[feature_id] = feature;

                    var contig = contigMap[contigName];
                    if (contig != undefined) {
                      var geneStop = feature.feature_locations[0].start;

                      if (feature.feature_locations[0].strand == '+') {
                        geneStop += feature.feature_locations[0].length;
                      }
                      if (contig.length < geneStop) {
                        contig.length = geneStop;
                      }

                      contig.genes.push(feature);
                    }

                  }
                }
              );
console.log("PARSED 2", featurelist);
              $self.genesSettings = {
                  "sPaginationType": "full_numbers",
                  "iDisplayLength": 10,
                  "aaSorting": [[ 1, "asc" ], [2, "asc"]],
                  "aoColumns": [
                                {sTitle: "Gene ID", mData: "id"},
                                {sTitle: "Contig", mData: "contig"},
                                {sTitle: "Start", mData: "start"},
                                {sTitle: "Strand", mData: "dir"},
                                {sTitle: "Length", mData: "len"},
                                {sTitle: "Type", mData: "type"},
                                {sTitle: "Function", mData: "func"}
                                ],
                                "aaData": [],
                                "oLanguage": {
                                    "sSearch": "Search gene:",
                                    "sEmptyTable": "No genes found."
                                },
                                "fnDrawCallback": function() { geneEvents(); contigEvents(); }
              };

              /*//XXX plants baloney - plants are a special case. If it's in plants or eukaryota, then we use the simpler display with less data.
              if (genomeType == 'transcriptome' || gnm.domain == 'Plant' || gnm.domain == 'Eukaryota') {
                  $self.genesSettings.aoColumns = [
                      {sTitle: "Gene ID", mData: "id"},
                      {sTitle: "Length", mData: "len"},
                      {sTitle: "Function", mData: "func"}
                  ];

                  // XXX more plants baloney. Remove the length column
                  if (gnm.domain == 'Plant' || gnm.domain == 'Eukaryota') {
                      $self.genesSettings["aaSorting"] = [[ 0, "asc" ], [1, "asc"]];
                      $self.genesSettings.aoColumns.splice(1,1);
                  }
                  // XXX done with plants
              }*/


              $self.content['genes'] = genesTableElem;
console.log("PARSED 3");
              /*//XXX plants baloney - build up the CDS div, if necessary.
              if (gnm.domain == 'Plant' || gnm.domain == 'Eukaryota') {

                  var cdsTab = $('#'+pref+'cds');
                  cdsTab.empty();
                  cdsTab.append('<table cellpadding="0" cellspacing="0" border="0" id="'+pref+'cds-table" \
                  class="table table-bordered table-striped" style="width: 100%; margin-left: 0px; margin-right: 0px;"/>');

                  var cdsSettings = {
                      "sPaginationType": "full_numbers",
                      "iDisplayLength": 10,
                      "aaSorting": [[ 0, "asc" ], [1, "asc"]],
                      "aoColumns": [
                          {sTitle: "Gene ID", mData: "id"},
                          {sTitle: "Function", mData: "func"}
                      ]
                  };

                  var cdsTable = $('#'+pref+'cds-table').dataTable(cdsSettings);
                  if (cdsData.length) {
                      cdsTable.fnAddData(cdsData);
                  }
              }
              //XXX done with plants*/

              function contigEvents() {
                  $('.'+pref+'contig-click').unbind('click');
                  $('.'+pref+'contig-click').click(function() {
                      var contigId = [$(this).data('contigname')];
                      showContig(contigId);
                  });
              }

              for (var key in contigMap) {
                  if (!contigMap.hasOwnProperty(key))
                      continue;
                  var contig = contigMap[key];
                  $self.contigsData.push({name: '<a class="'+pref+'contig-click" data-contigname="'+contig.name+'">'+contig.name+'</a>',
                      length: contig.length, genecount: contig.genes.length});
              }
              $self.contigsSettings = {
                      "sPaginationType": "full_numbers",
                      "iDisplayLength": 10,
                      "aaSorting": [[ 1, "desc" ]],
                      "aoColumns": [
                                    {sTitle: "Contig name", mData: "name"},
                                    {sTitle: "Length", mData: "length"},
                                    {sTitle: "Genes", mData: "genecount"}
                                    ],
                                    "aaData": [],
                                    "oLanguage": {
                                        "sSearch": "Search contig:",
                                        "sEmptyTable": "No contigs found."
                                    },
                                    "fnDrawCallback": contigEvents
              };



              $self.content['contigs'] = contigsTableElem;


console.log("PARSED ALL CONTENT", $self.genesData);

              $tab.empty();
              $tab.append($self.content[type]);
              $tab.hasContent = true;

              if (type == 'genes') {
                genesTable = $self.content[type].dataTable($self.genesSettings);
                genesTable.fnAddData($self.genesData);
                populated.genes = true;
              }
              else {
                contigsTable = $self.content[type].dataTable($self.contigsSettings);
                contigsTable.fnAddData($self.contigsData);
                populated.contigs = true;
              }


            })
            .fail(function (d) {
              $tab.empty();
              $tab
                  .addClass('alert alert-danger')
                  .html("Could not load features : " + d.error.message);
            });

            return $self.loaderElem();

          }

          if (populated[type] == true) {
            return this.content[type];
          }
          else {
            setTimeout( function() {
              console.log("TAB WAS", $tab, $tab.html());
              $tab.empty();
              $tab.append($self.content[type]);
              $tab.hasContent = true;
              console.log("TAB IS NOW", $tab, $tab.html());
              if (type == 'genes') {
              console.log("APPENDS TABLE", $self.genesSettings);
                genesTable = $self.content[type].dataTable($self.genesSettings);
                console.log("HAS OBJ");
                genesTable.fnAddData($self.genesData);
                console.log("ADDED DATA");
                populated.genes = true;
              }
              else {
              console.log("APPENDS TABLE", $self.contigsSettings);
                contigsTable = $self.content[type].dataTable($self.contigsSettings);
              console.log("HAS OBJ", $self.contigsData);
                contigsTable.fnAddData($self.contigsData);
              console.log("ADDED DATA");
                populated.contigs = true;
              }
            }, 0);
            return '';
          }

        },

        //Sam says that it's considered a transcriptome if there are no contigs, or if the features lack locations.
        genomeType : function(genome) {
            //return 'genome';

            if (
                (! genome.contig_ids || genome.contig_ids.length == 0)
            ) {

                var has_location = false;
                $.each(
                    genome.features,
                    function (idx, feature) {

                        if (feature.location && feature.location.length) {
                            has_location = true;
                            return;
                        }
                    }
                );

                if (! has_location) {
                    return 'transcriptome';
                }
            }

            return 'genome';
        },

        tabData : function(genome) {

            var type = this.genomeType(genome);

            if (type == 'transcriptome') {

                //normally, we just have an Overview and a Genes tab.
                var names = ['Overview', 'Genes'];
                var ids = ['overview', 'genes'];

                //XXX plants baloney - but plants also get a CDS column.
                if (genome.domain == 'Plant' || genome.domain == 'Eukaryota') {
                    names.push('CDS');
                    ids.push('cds');
                }

                if (genome.ontology_mappings.length) {
                  names.push('Ontology');
                  ids.push('ontology');
                }

                return {
                    names   : names,
                    ids     : ids
                };
            }
            else {

                //normally, we just have an Overview, Contigs, and Genes tab.
                var names = ['Overview', 'Contigs', 'Genes'];
                var ids = ['overview', 'contigs', 'genes'];

                //XXX plants baloney - but plants get different columns
                if (genome.domain == 'Plant' || genome.domain == 'Eukaryota') {
                    names = ['Overview', 'Genes', 'CDS'];
                    ids = ['overview', 'genes', 'cds'];
                }

                if (genome.ontology_mappings.length) {
                  names.push('Ontology');
                  ids.push('ontology');
                }

                return {
                    names : names,
                    ids : ids
                };
            }
        },

        render: function() {
            var self = this;
            var pref = StringUtil.uuid();

            var container = this.$elem;
            if (self.token == null) {
                container.empty();
                container.append("<div>[Error] You're not logged in</div>");
                return;
            }

            var kbws = new Workspace(self.wsUrl, {'token': self.token});

            kbws.get_objects([{ref : this.options.wsNameOrId + '/' + this.options.objNameOrId}]).then(function(d) {
              console.log("KBWS GOT BACK ", d);
            });
console.log("RENDERED"); return;
            var ready = function(gnm, ctg) {
                    container.empty();
                    var tabPane = $('<div id="'+pref+'tab-content">');
                    container.append(tabPane);
                    var tabObj = new kbaseTabs(tabPane, {canDelete : true, tabs : []});

                    var genomeType = self.genomeType(gnm);

                    var ontology_mappings = [];
                    $.each(
                      gnm.features,
                      function (i,f) {
                        if (f.ontology_terms) {
                          ontology_mappings.push(f);
                        }
                      }
                    );

                    gnm.ontology_mappings = ontology_mappings;

                    var tabData = self.tabData(gnm);
                    var tabNames = tabData.names;
                    var tabIds = tabData.ids;

                    for (var i=0; i<tabIds.length; i++) {
                      var tabDiv = $('<div id="'+pref+tabIds[i]+'"> ');
                      tabObj.addTab({tab: tabNames[i], content: tabDiv, canDelete : false, show: (i == 0)});
                    }

                    var contigCount = 0;
                    if (gnm.contig_ids && gnm.contig_lengths && gnm.contig_ids.length == gnm.contig_lengths.length) {
                        contigCount = gnm.contig_ids.length;
                    } else if (ctg && ctg.contigs) {
                        contigCount = ctg.contigs.length;
                    }

                    ////////////////////////////// Overview Tab //////////////////////////////
                    $('#'+pref+'overview').append('<table class="table table-striped table-bordered" \
                            style="margin-left: auto; margin-right: auto;" id="'+pref+'overview-table"/>');
                    var overviewLabels = ['Name', 'Domain', 'Genetic code', 'Source', "Source ID", "GC", "Taxonomy", "Size",
                                          "Number of Contigs", "Number of Genes"];

                    var tax = gnm.taxonomy;
                    if (tax == null)
                        tax = '';
                    var gc_content = gnm.gc_content;
                    if (gc_content) {
                        gc_content = Number(gc_content);
                        if (gc_content < 1.0)
                            gc_content *= 100;
                        gc_content = gc_content.toFixed(2) + " %";
                    } else {
                        gc_content = "Unknown";
                    }

                    var overviewData = [gnm.id, '<a href="/#dataview/'+self.ws_name+'/'+self.ws_id+'" target="_blank">'+gnm.scientific_name+'</a>',
                                        gnm.domain, gnm.genetic_code, gnm.source, gnm.source_id, gc_content, tax, gnm.dna_size,
                                        contigCount, gnm.features.length];

                    //XXX baloney Plants hack.
                    //Plant genes need different information, and we want to display the gene and transcript counts separately
                    //so if the domain is plants, add on the extra label, pop off the existing length value, and push on the length of genes and
                    //transcripts individually.
                    if (gnm.domain == 'Plant' || gnm.domain == 'Eukaryota') {
                        overviewLabels.push('Number of Transcripts');
                        var types = {};
                        $.each(gnm.features, function(i,v) {
                            if (types[v.type] == undefined) {types[v.type] = 0};
                            types[v.type]++;
                        });

                        overviewData.pop();
                        overviewData.push(types['locus']);
                        overviewData.push(types['CDS']);
                    }
                    //XXX end plants baloney here. There's more below for the Genes table.

                    //XXX this is hopelessly brittle since it relies upon injecting/removing specific fields at exact locations in the parallel arrays.
                    //these should be refactored - a single master list of all possible fields as objects ( { name : 'Kbase ID', value : gnm.id, id : 'kbase_id' } )
                    //and then different lists built with the lookup keys depending upon the genome type, the way that the tab ids are built up above. I don't want
                    //to do that right now. :-/

                    if (genomeType != 'genome') {
                        //XXX plants baloney - don't display the subtype if it's plant or eukaryota domain
                        if (gnm.domain != 'Plant' && gnm.domain != 'Eukaryota') {
                          overviewLabels.splice(3, 0, 'Subtype');
                        }
                        overviewData.splice(3, 0, genomeType);
                    }

                    if (genomeType == 'transcriptome') {
                        overviewLabels.splice(7,1);
                        overviewData.splice(7,1);
                        overviewLabels.splice(9,1);
                        overviewData.splice(9,1);
                    }
                    //end brittleness.


                    var overviewTable = $('#'+pref+'overview-table');
                    for (var i=0; i<overviewData.length; i++) {
                        if (overviewLabels[i] === 'Taxonomy') {
                            overviewTable.append('<tr><td  width="33%">' + overviewLabels[i] + '</td> \
                                    <td><textarea style="width:100%;" cols="2" rows="3" readonly>'+overviewData[i]+'</textarea></td></tr>');
                        } else {
                            overviewTable.append('<tr><td>'+overviewLabels[i]+'</td> \
                                    <td>'+overviewData[i]+'</td></tr>');
                        }
                    }

                    ////ontology tab - should be lazily loaded, but we can't since we need to check for existence to know if we display the tab at all.
                    if (gnm.ontology_mappings.length) {
                      var ontologyTab = $('#' + pref + 'ontology');
                      ontologyTab.empty();
                      ontologyTab.append('<table cellpadding="0" cellspacing="0" border="0" id="'+pref+'ontology-table" \
                      class="table table-bordered table-striped" style="width: 100%; margin-left: 0px; margin-right: 0px;"/>');

                      var ontologySettings = {
                          "paginationType": "full_numbers",
                          "displayLength": 10,
                          "sorting": [[ 0, "asc" ], [1, "asc"]],
                          "columns": [
                              {title: "Gene ID", data: "id"},
                              {title: "# of ontology terms", data: "num"},
                              {title: "Ontology term name", data: "name"},
                              {title: "Ontology term ID", data: "term"},
                              {title: "Evidence count", data: "evidence_count"},
                          ],
                          createdRow: function (row, data, index) {

                              var $linkCell = $('td', row).eq(3);
                              var k = $linkCell.text();
                              $linkCell.empty();

                              $linkCell.append($.jqElem('a')
                                        .on('click', function(e) {
                                          var $tabDiv = $.jqElem('div').kbaseOntologyDictionary({ term_id : k});
                                          tabObj.addTab({tab: k, content: $tabDiv.$elem, canDelete : true, show: true});
                                        })
                                        .append(k));

                          }
                      };

                      var ontologyTable = $('#'+pref+'ontology-table').DataTable(ontologySettings);
                      var ontologyData  = [];

                      $.each(
                        gnm.ontology_mappings,
                        function(i, v) {
                          //ick. Need to double loop to tally up number of terms in advance. There's gotta be a more efficient way to do this.
                          v.num_terms = 0;
                          $.each(
                            v.ontology_terms,
                            function (k, o) {
                              v.num_terms += Object.keys(o).length
                            }
                          );
                          $.each(
                            v.ontology_terms,
                            function (k, o) {
                              $.each(
                                v.ontology_terms[k],
                                function (k, t) {
                                  ontologyData.push(
                                    {
                                      'id' : v.id,
                                      'num' : v.num_terms,
                                      'term' : k,
                                      'evidence_count' : t.evidence.length,
                                      'name' : t.term_name,
                                    }
                                  )
                                }
                              )
                            }
                          )
                        }
                      );
                      console.log("OD ", ontologyData[0]);

                      //ontologyTable.fnAddData(ontologyData);
                      ontologyTable.rows.add(ontologyData).draw();

                    }

                    ///////////////////// Contigs and Genes (lazy loading) /////////////////////
                    var contigsDiv = $('#'+pref+'contigs');
                    contigsDiv.append("<div><img src=\""+self.loadingImage+"\">&nbsp;&nbsp;loading contig data...</div>");

                    var genesDiv = $('#'+pref+'genes');
                    genesDiv.append("<div><img src=\""+self.loadingImage+"\">&nbsp;&nbsp;loading genes data...</div>");

                    //XXX plants baloney - only plants have a CDS tab.
                    var cdsDiv = $('#'+pref+'cds');
                    if (cdsDiv) {
                        cdsDiv.append("<div><img src=\""+self.loadingImage+"\">&nbsp;&nbsp;loading cds data...</div>");
                    }

                    var genesAreShown = false;

                    var liElems = tabPane.find('li');
                    for (var liElemPos = 0; liElemPos < liElems.length; liElemPos++) {
                        var liElem = $(liElems.get(liElemPos));
                        var aElem = liElem.find('a');
                        if (aElem.length != 1)
                            continue;
                        var dataTab = aElem.attr('data-tab');
                        //XXX plants baloney - only plants have a CDS tab.
                        if (dataTab === 'Contigs' || dataTab === 'Genes' || dataTab === 'CDS') {
                            aElem.on('click', function() {
                                if (!genesAreShown) {
                                    genesAreShown = true;
                                    self.prepareGenesAndContigs(pref, kbws, gnm, tabObj);
                                }
                            });
                        }

                    }
            };

            container.empty();
            container.append("<div><img src=\""+self.loadingImage+"\">&nbsp;&nbsp;loading genome data...</div>");

            var included = ["/complete","/contig_ids","/contig_lengths","contigset_ref","/dna_size",
                            "/domain","/gc_content","/genetic_code","/id","/md5","num_contigs",
                            "/scientific_name","/source","/source_id","/tax_id","/taxonomy",
                            "/features/[*]/type", "/features/[*]/unknownfield", "/features/[*]/location", "/features/[*]/ontology_terms","/features/[*]/id"];
            //var ws_params = {ref: self.ws_name + "/" + self.ws_id, included: included};
            var ws_params = {included: included};
            ws_params[self.wsKey] = self.dictionary_params[self.wsKey];
            ws_params[self.objKey] = self.dictionary_params[self.objKey];
            kbws.get_object_subset([ws_params], function(data) {
            //kbws.get_object([{ref: self.ws_name + "/" + self.ws_id}], function(data) {
                var gnm = data[0].data;
                if (gnm.contig_ids && gnm.contig_lengths && gnm.contig_ids.length == gnm.contig_lengths.length) {
                    ready(gnm, null);
                } else {
                    var contigSetRef = gnm.contigset_ref;
                    if (gnm.contigset_ref) {
                        var ws_params = {included: ['contigs/[*]/unknownfield']};
                        ws_params[self.wsKey] = self.dictionary_params[self.wsKey];
                        ws_params[self.objKey] = self.dictionary_params[self.objKey];
                        kbws.get_object_subset([ws_params], function(data2) {
                            var ctg = data2[0].data;
                            ready(gnm, ctg);
                        }, function(data2) {
                            container.empty();
                            container.append('<p>[Error] ' + data2.error.message + '</p>');
                        });
                    } else {
                        container.empty();
                        container.append('Genome object has unsupported structure (no contig-set)');
                    }
                }
            }, function(data) {
                container.empty();
                container.append('<p>[Error] ' + data.error.message + '</p>');
            });
            return this;
        },

        prepareGenesAndContigs: function(pref, kbws, gnm, tabPane) {
            var self = this;
            var ws_params = {included:
                ["/features/[*]/aliases","/features/[*]/annotations",
                 "/features/[*]/function","/features/[*]/id","/features/[*]/location",
                 "/features/[*]/protein_translation_length",
                 "/features/[*]/dna_translation_length","/features/[*]/type"]
            };
                        ws_params[self.wsKey] = self.dictionary_params[self.wsKey];
                        ws_params[self.objKey] = self.dictionary_params[self.objKey];
            var subsetRequests = [ws_params];
            if (!(gnm.contig_ids && gnm.contig_lengths && gnm.contig_ids.length == gnm.contig_lengths.length)) {
                var contigSetRef = gnm.contigset_ref;
                subsetRequests.push({ref: contigSetRef, included: ['contigs/[*]/id', 'contigs/[*]/length']});
            }
            kbws.get_object_subset(subsetRequests, function(data) {
                gnm.features = data[0].data.features;

                ////////////////////////////// Genes Tab //////////////////////////////
                var geneTab = $('#'+pref+'genes');
                geneTab.empty();
                geneTab.append('<table cellpadding="0" cellspacing="0" border="0" id="'+pref+'genes-table" \
                class="table table-bordered table-striped" style="width: 100%; margin-left: 0px; margin-right: 0px;"/>');
                var geneMap = {};
                var contigMap = {};

                var cdsData = [] //XXX plants baloney. Extra tab for CDS data. See below on line 372 or so.
                var mrnaData = [] //XXX plants baloney. We throw away mrnaData. See below on line 372 or so.

                if (data.length > 1) {
                    var ctg = data[1].data;
                    for (var pos in ctg.contigs) {
                        var contigId = ctg.contigs[pos].id;
                        var contigLen = ctg.contigs[pos].length;
                        contigMap[contigId] = {name: contigId, length: contigLen, genes: []};
                    }
                } else {
                    for (var pos in gnm.contig_ids) {
                        var contigId = gnm.contig_ids[pos];
                        var contigLen = gnm.contig_lengths[pos];
                        contigMap[contigId] = {name: contigId, length: contigLen, genes: []};
                    }
                }

                function geneEvents() {
                    $('.'+pref+'gene-click').unbind('click');
                    $('.'+pref+'gene-click').click(function() {
                        var geneId = [$(this).data('geneid')];
                        showGene(geneId);
                    });
                }

                var genomeType = self.genomeType(gnm);

                for (var genePos in gnm.features) {
                    var gene = gnm.features[genePos];
                    gene.arrPos = genePos;
                    var geneId = gene.id;
                    var contigName = null;
                    var geneStart = null;
                    var geneDir = null;
                    var geneLen = null;
                    if (gene.location && gene.location.length > 0) {
                        contigName = gene.location[0][0];
                        geneStart = gene.location[0][1];
                        geneDir = gene.location[0][2];
                        geneLen = gene.location[0][3];
                    }

                    if (genomeType == 'transcriptome') {
                        geneLen = gene.dna_translation_length || gene.protein_translation_length || '';
                    }

                    var geneType = gene.type;
                    var geneFunc = gene['function'];
                    if (!geneFunc)
                        geneFunc = '-';

                    //XXX plants baloney - if it's non plant, it just goes into the genes array.
                    //but if it is plants, then we split it up - same data, two different tabs.
                    //locus data goes on the genes tab, cds data goes on the cds tab.
                    //We're also creating an mrnaData array for mrna data, but we're just throwing that out later.

                    var dataArray = [];
                    if ((gnm.domain != 'Plant' && gnm.domain != 'Eukaryota') || gene.type == 'locus') {
                      dataArray = $self.genesData;
                    }
                    else if (gene.type == 'CDS') {
                      dataArray = cdsData;
                    }
                    else if (gene.type == 'mRNA') {
                      dataArray = mrnaData;
                    }

                    dataArray.push({
                        // id: '<a href="/#dataview/'+self.ws_name+'/'+self.ws_id+'?sub=Feature&subid='+geneId+'" target="_blank">'+geneId+'</a>',
                        id: '<a class="'+pref+'gene-click" data-geneid="'+geneId+'">'+geneId+'</a>',
                        // contig: contigName,
                        contig: '<a class="' + pref + 'contig-click" data-contigname="'+contigName+'">' + contigName + '</a>',
                        start: geneStart,
                        dir: geneDir,
                        len: geneLen,
                        type: geneType,
                        func: geneFunc
                    });
                    geneMap[geneId] = gene;
                    var contig = contigMap[contigName];
                    if (contigName != null && !contig) {
                        contig = {name: contigName, length: 0, genes: []};
                        contigMap[contigName] = contig;
                    }
                    if (contig) {
                        var geneStop = Number(geneStart);
                        if (geneDir == '+')
                            geneStop += Number(geneLen);
                        if (contig.length < geneStop) {
                            contig.length = geneStop;
                        }
                        contig.genes.push(gene);
                    }
                }
                var genesSettings = {
                    "sPaginationType": "full_numbers",
                    "iDisplayLength": 10,
                    "aaSorting": [[ 1, "asc" ], [2, "asc"]],
                    "aoColumns": [
                                  {sTitle: "Gene ID", mData: "id"},
                                  {sTitle: "Contig", mData: "contig"},
                                  {sTitle: "Start", mData: "start"},
                                  {sTitle: "Strand", mData: "dir"},
                                  {sTitle: "Length", mData: "len"},
                                  {sTitle: "Type", mData: "type"},
                                  {sTitle: "Function", mData: "func"}
                                  ],
                                  "aaData": [],
                                  "oLanguage": {
                                      "sSearch": "Search gene:",
                                      "sEmptyTable": "No genes found."
                                  },
                                  "fnDrawCallback": function() { geneEvents(); contigEvents(); }
                };

                //XXX plants baloney - plants are a special case. If it's in plants or eukaryota, then we use the simpler display with less data.
                if (genomeType == 'transcriptome' || gnm.domain == 'Plant' || gnm.domain == 'Eukaryota') {
                    $self.genesSettings.aoColumns = [
                        {sTitle: "Gene ID", mData: "id"},
                        {sTitle: "Length", mData: "len"},
                        {sTitle: "Function", mData: "func"}
                    ];

                    // XXX more plants baloney. Remove the length column
                    if (gnm.domain == 'Plant' || gnm.domain == 'Eukaryota') {
                        $self.genesSettings["aaSorting"] = [[ 0, "asc" ], [1, "asc"]];
                        $self.genesSettings.aoColumns.splice(1,1);
                    }
                    // XXX done with plants
                }

                var genesTable = $('#'+pref+'genes-table').dataTable($self.genesSettings);
                if ($self.genesData.length) {
                    genesTable.fnAddData($self.genesData);
                }

                //XXX plants baloney - build up the CDS div, if necessary.
                if (gnm.domain == 'Plant' || gnm.domain == 'Eukaryota') {

                    var cdsTab = $('#'+pref+'cds');
                    cdsTab.empty();
                    cdsTab.append('<table cellpadding="0" cellspacing="0" border="0" id="'+pref+'cds-table" \
                    class="table table-bordered table-striped" style="width: 100%; margin-left: 0px; margin-right: 0px;"/>');

                    var cdsSettings = {
                        "sPaginationType": "full_numbers",
                        "iDisplayLength": 10,
                        "aaSorting": [[ 0, "asc" ], [1, "asc"]],
                        "aoColumns": [
                            {sTitle: "Gene ID", mData: "id"},
                            {sTitle: "Function", mData: "func"}
                        ]
                    };

                    var cdsTable = $('#'+pref+'cds-table').dataTable(cdsSettings);
                    if (cdsData.length) {
                        cdsTable.fnAddData(cdsData);
                    }
                }
                //XXX done with plants

                ////////////////////////////// Contigs Tab //////////////////////////////
                var contigTab = $('#'+pref+'contigs');
                contigTab.empty();
                contigTab.append($('<div>').append('<table cellpadding="0" cellspacing="0" border="0" id="'+pref+'contigs-table" '+
                    'class="table table-bordered table-striped" style="width: 100%; margin-left: 0px; margin-right: 0px;"/>'));

                function contigEvents() {
                    $('.'+pref+'contig-click').unbind('click');
                    $('.'+pref+'contig-click').click(function() {
                        var contigId = [$(this).data('contigname')];
                        showContig(contigId);
                    });
                }

                for (var key in contigMap) {
                    if (!contigMap.hasOwnProperty(key))
                        continue;
                    var contig = contigMap[key];
                    $self.contigsData.push({name: '<a class="'+pref+'contig-click" data-contigname="'+contig.name+'">'+contig.name+'</a>',
                        length: contig.length, genecount: contig.genes.length});
                }
                $self.contigsSettings = {
                        "sPaginationType": "full_numbers",
                        "iDisplayLength": 10,
                        "aaSorting": [[ 1, "desc" ]],
                        "aoColumns": [
                                      {sTitle: "Contig name", mData: "name"},
                                      {sTitle: "Length", mData: "length"},
                                      {sTitle: "Genes", mData: "genecount"}
                                      ],
                                      "aaData": [],
                                      "oLanguage": {
                                          "sSearch": "Search contig:",
                                          "sEmptyTable": "No contigs found."
                                      },
                                      "fnDrawCallback": contigEvents
                };
                var contigsTable = $('#'+pref+'contigs-table').dataTable($self.contigsSettings);
                contigsTable.fnAddData($self.contigsData);

                ////////////////////////////// New Tab //////////////////////////////
                var lastElemTabNum = 0;

                function openTabGetId(tabName) {
                    if (tabPane.hasTab(tabName))
                        return null;
                    lastElemTabNum++;
                    var tabId = '' + pref + 'elem' + lastElemTabNum;
                    var tabDiv = $('<div id="'+tabId+'"> ');
                    tabPane.addTab({tab: tabName, content: tabDiv, canDelete : true, show: true, deleteCallback: function(name) {
                        tabPane.removeTab(name);
                        tabPane.showTab(tabPane.activeTab());
                    }});
                    return tabId;
                }

                function showGene(geneId) {
                    var tabId = openTabGetId(geneId);
                    if (tabId == null) {
                        tabPane.showTab(geneId);
                        return;
                    }
                    var gene = geneMap[geneId];
                    var contigName = null;
                    var geneStart = null;
                    var geneDir = null;
                    var geneLen = null;
                    if (gene.location && gene.location.length > 0) {
                        contigName = gene.location[0][0];
                        geneStart = gene.location[0][1];
                        geneDir = gene.location[0][2];
                        geneLen = gene.location[0][3];
                    }
                    var geneType = gene.type;
                    var geneFunc = gene['function'];
                    var geneAnn = '';
                    if (gene['annotations'])
                        geneAnn = gene['annotations'];
                    $('#'+tabId).append('<table class="table table-striped table-bordered" \
                            style="margin-left: auto; margin-right: auto;" id="'+tabId+'-table"/>');
                    var elemLabels = ['Gene ID', 'Contig name', 'Gene start', 'Strand', 'Gene length', "Gene type", "Function", "Annotations"];
                    var elemData = ['<a href="/#dataview/'+self.ws_name+'/'+self.ws_id+'?sub=Feature&subid='+geneId+'" target="_blank">'+geneId+'</a>',
                                    '<a class="'+tabId+'-click2" data-contigname="'+contigName+'">' + contigName + '</a>',
                                    geneStart, geneDir, geneLen, geneType, geneFunc, geneAnn];
                    var elemTable = $('#'+tabId+'-table');
                    for (var i=0; i<elemData.length; i++) {
                        if (elemLabels[i] === 'Function') {
                            elemTable.append('<tr><td>' + elemLabels[i] + '</td> \
                                    <td><textarea style="width:100%;" cols="2" rows="3" readonly>'+elemData[i]+'</textarea></td></tr>');
                        } else if (elemLabels[i] === 'Annotations') {
                            elemTable.append('<tr><td>' + elemLabels[i] + '</td> \
                                    <td><textarea style="width:100%;" cols="2" rows="3" readonly>'+elemData[i]+'</textarea></td></tr>');
                        } else {
                            elemTable.append('<tr><td>'+elemLabels[i]+'</td> \
                                    <td>'+elemData[i]+'</td></tr>');
                        }
                    }
                    elemTable.append('<tr id="seq-loader"><td colspan=2><img src="' + self.loadingImage + '"></td></tr>');
                    var ws_params = {
                        //ref: self.ws_name + "/" + self.ws_id,
                        included: ['/features/' + gene.arrPos + '/protein_translation',
                                   '/features/' + gene.arrPos + '/dna_sequence']
                    };
                        ws_params[self.wsKey] = self.dictionary_params[self.wsKey];
                        ws_params[self.objKey] = self.dictionary_params[self.objKey];
                    Promise.resolve(kbws.get_object_subset([ws_params])).then(function(data) {
                        elemTable.find('#seq-loader').remove();
                        data = data[0].data;
                        if (data.features) {
                            var f = data.features[0];
                            if (f.protein_translation) {
                                elemTable.append('<tr><td>Protein Translation</td><td><div class="kb-ga-seq">' + f.protein_translation + '</div></td></tr>');
                            }
                            if (f.dna_sequence) {
                                elemTable.append('<tr><td>Nucleotide Sequence</td><td><div class="kb-ga-seq">' + f.dna_sequence + '</div></td></tr>');
                            }
                        }
                    });
                    $('.'+tabId+'-click2').click(function() {
                        showContig($(this).data('contigname'));
                    });
                    tabPane.showTab(geneId);
                }

                function showContig(contigName) {
                    var tabId = openTabGetId(contigName);
                    if (tabId == null) {
                        tabPane.showTab(contigName);
                        return;
                    }
                    var contig = contigMap[contigName];
                    $('#'+tabId).append('<table class="table table-striped table-bordered" \
                            style="margin-left: auto; margin-right: auto;" id="'+tabId+'-table"/>');
                    var elemLabels = ['Contig name', 'Length', 'Gene count'];
                    var elemData = [contigName, contig.length, contig.genes.length];
                    var elemTable = $('#'+tabId+'-table');
                    for (var i=0; i<elemData.length; i++) {
                        elemTable.append('<tr><td>'+elemLabels[i]+'</td><td>'+elemData[i]+'</td></tr>');
                    }
                    var cgb = new ContigBrowserPanel();
                    cgb.data.options.contig = contig;
                    cgb.data.options.svgWidth = self.width - 28;
                    cgb.data.options.onClickFunction = function(svgElement, feature) {
                        showGene(feature.feature_id);
                    };
                    cgb.data.options.token = self.token;
                    cgb.data.$elem = $('<div style="width:100%; height: 200px;"/>');
                    cgb.data.$elem.show(function(){
                        cgb.data.update();
                    });
                    $('#'+tabId).append(cgb.data.$elem);
                    cgb.data.init();
                    tabPane.showTab(contigName);
                }
            }, function(data) {
                container.empty();
                container.append('<p>[Error] ' + data.error.message + '</p>');
            });
        },

        showOntology : function(ontologyID) {

        },

        loggedInCallback: function(event, auth) {
            this.token = auth.token;
            this.render();
            return this;
        },

        loggedOutCallback: function(event, auth) {
            this.token = null;
            this.render();
            return this;
        },
    });
});