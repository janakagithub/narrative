/**
 * @author Bill Riehl <wjriehl@lbl.gov>
 * @public
 */

(function( $, undefined ) {
    $.KBWidget({
        name: "kbaseNarrativeMethodInput",
        parent: "kbaseNarrativeInput",
        version: "1.0.0",
        options: {
            loadingImage: "../images/ajax-loader.gif",
        },

        init: function(options) {
            this._super(options);

            this.render();
            this.refresh();
            return this;
        },

        useSelect2: true,

        
        parameterInputWidgets: [],
        
        /**
         * Builds the input div for a function cell, based on the given method object.
         * @param {Object} method - the method being constructed around.
         * @returns {String} an HTML string describing the available parameters for the cell.
         * @private
         */
        render: function() {
            // figure out all types from the method
            var method = this.options.method;
            var params = method.parameters;

            var $inputParameterContainer = $('<div>');
            
            var $optionsDiv = $('<div>');
            var $advancedOptionsDiv = $('<div>').append("<b>advanced options:</b>");
            
            for (var i=0; i<params.length; i++) {
                var paramSpec = params[i];
                var $stepDiv = $('<div>');
                
                //this.$inputWidget = this.$inputDiv[inputWidgetName]({ method: this.options.method });
                // check what kind of parameter here.
                if (paramSpec.field_type === "text") {
                    $stepDiv["kbaseNarrativeParameterTextInput"]({loadingImage: this.options.loadingImage, parsedParameterSpec: params[i]});
                } else {
                    // this is what we should do:  this.getErrorDiv()
                    $stepDiv.append('<span class="label label-danger">Parameter '+paramSpec.id+
                                    ' not displaying properly, invalid parameter type: "'+paramSpec.field_type+'"</span>');
                }
                
                // If it is an advanced option, then we must place it in the correct div
                var isAdvanced = false;
                if (paramSpec.advanced) {
                    if (paramSpec.advanced === true || paramSpec.advanced === 1) {
                        isAdvanced = true;
                    }
                }
                if (isAdvanced) {
                    $advancedOptionsDiv.append($stepDiv);
                } else {
                    $optionsDiv.append($stepDiv);
                }
            }
            
            $inputParameterContainer.append($optionsDiv);
            $inputParameterContainer.append($advancedOptionsDiv);
            
            this.$elem.append($inputParameterContainer);
            
            
            /*var inputDiv = "<div class='kb-cell-params'><table class='table'>";
            for (var i=0; i<params.length; i++) {
                var p = params[i];

                var input_default = (p.default_values[0] !== "" && p.default_values[0] !== undefined) ?
                                    " placeholder='" + p.default_values[0] + "'" : "";
                input = "<input class='form-control' style='width: 95%' name='" + p.id + "'" + input_default +
                        " value='' type='text'></input>";

                var cellStyle = "border:none; vertical-align:middle;";
                inputDiv += "<tr style='" + cellStyle + "'>" + 
                                "<th style='" + cellStyle + " font-family: 'OxygenBold', sans-serif; font-weight: bold;>" + p.ui_name + "</th>" +
                                "<td style='" + cellStyle + " width: 40%;'>" + input + "</td>" +
                                "<td style='" + cellStyle + " color: #777;'>" + p.short_hint + "</td>" +
                            "</tr>";
            }
            inputDiv += "</table></div>";
            this.$elem.append(inputDiv);*/
        },

        /**
         * Returns a list of parameters in the order in which the given method
         * requires them.
         * @return {Array} an array of strings - one for each parameter
         * @public
         */
        getParameters: function() {
            var paramList = [];

            $(this.$elem).find("[name^=param]").filter(":input").each(function(key, field) {
                paramList.push(field.value.trim());
            });

            return paramList;
        },

        /**
         * Returns an object representing the state of this widget.
         * In this particular case, it is a list of key-value pairs, like this:
         * { 
         *   'param0' : 'parameter value',
         *   'param1' : 'parameter value'
         * }
         * with one key/value for each parameter in the defined method.
         */
        getState: function() {
            var state = {};

            $(this.$elem).find("[name^=param]").filter(":input").each(function(key, field) {
                state[field.name] = field.value;
            });

            return state;
        },

        /**
         * Adjusts the current set of parameters based on the given state.
         * Doesn't really do a whole lot of type checking yet, but it's assumed that
         * a state will be loaded from an object generated by getState.
         */
        loadState: function(state) {
            if (!state)
                return;

            $(this.$elem).find("[name^=param]").filter(":input").each(function(key, field) {
                var $field = $(field);
                var fieldName = $field.attr("name");

                // If it's a text field, just dump the value in there.
                if ($field.is("input") && $field.attr("type") === "text") {
                    $field.val(state[fieldName]);
                }

                // If it's a select field, do the same... we'll have comboboxen or something,
                // eventually, so I'm just leaving this open for that.
                else if ($field.is("select")) {
                    $field.val(state[fieldName]);
                }
            });
        },

        /**
         * Refreshes the input fields for this widget. I.e. if any of them reference workspace
         * information, those fields get refreshed without altering any other inputs.
         */
        refresh: function() {
            var method = this.options.method;
            var params = method.parameters;
            var lookupTypes = [];
            var tempObj = {};
            for (var i=0; i<params.length; i++) {
                var p = params[i];
                if (p.text_options.valid_ws_types.length > 0) {
                    if (!tempObj.hasOwnProperty(p.text_options.valid_ws_types[0])) {
                        lookupTypes.push(p.text_options.valid_ws_types[0]);
                        tempObj[p.text_options.valid_ws_types[0]] = 1;
                    } 
                }
            }

            this.trigger('dataLoadedQuery.Narrative', [lookupTypes, this.IGNORE_VERSION, $.proxy(
                function(objects) {
                    // we know from each parameter what each input type is.
                    // we also know how many of each type there is.
                    // so, iterate over all parameters and fulfill cases as below.

                    for (var i=0; i<params.length; i++) {
                        var p = params[i];

                        // we're refreshing, not rendering, so assume that there's an
                        // input with name = pid present.
                        var $input = $($(this.$elem).find("[name=" + p.id + "]"));
                        var objList = [];

                        /*
                         * New sorting - by date, then alphabetically within dates.
                         */
                        var types = p.text_options.valid_ws_types;
                        for (var j=0; j<types.length; j++) {
                            if (objects[types[j]] && objects[types[j]].length > 0) {
                                objList = objList.concat(objects[types[j]]);
                            }
                        }
                        objList.sort(function(a, b) {
                            if (a[3] > b[3]) return -1;
                            if (a[3] < b[3]) return 1;
                            if (a[1] < b[1]) return -1;
                            if (a[1] > b[1]) return 1;
                            return 0;
                        });

                        /* down to cases:
                         * 1. (simple) objList is empty, $input doesn't have a list attribute.
                         * -- don't do anything.
                         * 2. objList is empty, $input has a list attribute.
                         * -- no more data exists, so remove that list attribute and the associated datalist element
                         * 3. objList is not empty, $input doesn't have a list attribute.
                         * -- data exists, new datalist needs to be added and linked.
                         * 4. objList is not empty, $input has a list attribute.
                         * -- datalist needs to be cleared and updated.
                         */

                        // case 1 - no data, input is unchanged

                        // case 2 - no data, need to clear input
                        var datalistID = $input.attr('list');
                        if (objList.length == 0 && datalistID) {
                            $(this.$elem.find("#" + datalistID)).remove();
                            $input.removeAttr('list');
                            $input.val("");
                        }

                        // case 3 - data, need new datalist
                        // case 4 - data, need to update existing datalist
                        else if (objList.length > 0) {
                            var $datalist;
                            if (!datalistID) {
                                datalistID = this.genUUID();
                                $input.attr('list', datalistID);
                                $datalist = $('<datalist>')
                                            .attr('id', datalistID);
                                $input.after($datalist);
                            }
                            else {
                                $datalist = $(this.$elem.find("#" + datalistID));
                            }
                            $datalist.empty();
                            for (var j=0; j<objList.length; j++) {
                                $datalist.append($('<option>')
                                                 .attr('value', objList[j][1])
                                                 .append(objList[j][1]));
                            }
                        }
                    }
                },
                this
            )]);
        },
        
        
        /* input types */
        
        /*
         * render the parameter spec; this should be refactored to be OO code instead of a big
         * if/else, but I don't know the right way to do js OO -mike
         *
         * should return the jquery element of the parameter spec div
         */
        renderParameterDiv : function(parameterSpec) {
            var p = $('<div>');
            
            
            
            
            return p;
        },
        
        
        
        
        
        
        genUUID: function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
                return v.toString(16);
            });
        }
    });

})( jQuery );