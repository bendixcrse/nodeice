"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var fs = require("fs"),
    readFile = require("read-utf8"),
    mustache = require("mustache"),
    sameTime = require("same-time"),
    oneByOne = require("one-by-one"),
    iterateObject = require("iterate-object"),
    noop = require("noop6"),
    EventEmitter = require("events").EventEmitter,
    ul = require("ul"),
    htmlPdf = require("phantom-html-to-pdf")({ phantomPath: require("phantomjs-prebuilt").path }),
    isStream = require("is-stream");

/**
 * Invoice
 * This is the constructor that creates a new instance containing the needed
 * methods.
 *
 * @name Invoice
 * @function
 * @param {Object} options The options for creating the new invoice:
 *
 *  - `config` (Object):
 *    - `template` (String): The HTML root template.
 *  - `data` (Object):
 *    - `currencyBalance` (Object):
 *      - `main` (Number): The main balance.
 *      - `secondary` (Number): The converted main balance.
 *      - `tasks` (Array): An array with the tasks (description of the services you did).
 *      - `invoice` (Object): Information about invoice.
 *  - `seller` (Object): Information about seller.
 *  - `buyer` (Object): Information about buyer.
 */
module.exports = function () {
    function NodeIce(options) {
        _classCallCheck(this, NodeIce);

        this.options = options;
        this.templates = {};
    }

    /**
     * initTemplates
     * Inits the HTML templates.
     *
     * @name initTemplates
     * @function
     * @param {Function} callback The callback function.
     */


    _createClass(NodeIce, [{
        key: "initTemplates",
        value: function initTemplates(callback) {
            var _this = this;

            if (this.templates.root === undefined || this.templates.tableRowBlock === undefined) {
                sameTime([function (cb) {
                    return readFile(_this.options.config.template, cb);
                }, function (cb) {
                    return readFile(_this.options.config.tableRowBlock, cb);
                }], function (err, data) {
                    if (err) {
                        return callback(err);
                    }
                    _this.templates.root = data[0];
                    _this.templates.tableRowBlock = data[1];
                    callback(null, _this.templates);
                });
            } else {
                return callback(null, this.templates);
            }
        }

        /**
         * toHtml
         * Renders the invoice in HTML format.
         *
         * @name toHtml
         * @function
         * @param {String} output An optional path to the output file.
         * @param {Function} callback The callback function.
         * @return {Invoice} The `Nodeice` instance.
         */

    }, {
        key: "toHtml",
        value: function toHtml(output, callback) {
            var _this2 = this;

            if (typeof output === "function") {
                callback = output;
                output = null;
            }

            var options = this.options,
                tasks = options.data.tasks,
                invoiceHtml = "",
                invoiceData = {
                bxTotals: options.data.bxTotals,
                seller: options.seller,
                buyer: options.buyer,
                invoice: options.data.invoice,
                description_rows: "",
                total: {
                    main: 0,
                    secondary: 0
                }
            };

            this.initTemplates(function (err, templates) {
                if (err) {
                    return callback(err);
                }

                iterateObject(tasks, function (cTask, i) {
                    // Set the additional fields and compute data
                    cTask.nrCrt = i + 1;
                    if (typeof cTask.unitPrice === "number") {
                        cTask.unitPrice = {
                            main: cTask.unitPrice,
                            secondary: _this2.convertToSecondary(cTask.unitPrice)
                        };
                    }

                    if (typeof cTask.unitPrice.main === "number") {
                        // Set the unit price of this row
                        cTask.unitPrice.main = cTask.unitPrice.main.toFixed(2);
                        cTask.unitPrice.secondary = cTask.unitPrice.secondary.toFixed(2);
                    }

                    // Build amount object
                    cTask.amount = {
                        main: cTask.unitPrice.main * cTask.quantity,
                        secondary: cTask.unitPrice.secondary * cTask.quantity
                    };

                    // Sum the amount to the total
                    invoiceData.total.main += cTask.amount.main;
                    invoiceData.total.secondary += cTask.amount.secondary;

                    // Set the amount of this row
                    cTask.amount.main = cTask.amount.main.toFixed(2);
                    cTask.amount.secondary = cTask.amount.secondary.toFixed(2);

                    // Render HTML for the current row
                    invoiceData.description_rows += mustache.render(templates.tableRowBlock, cTask);
                });

                // Set the total
                invoiceData.total.main = invoiceData.total.main.toFixed(2);
                invoiceData.total.secondary = invoiceData.total.secondary.toFixed(2);

                // Render the invoice HTML fields
                invoiceHtml = mustache.render(templates.root, invoiceData);

                // Output file
                if (typeof output === "string") {
                    fs.writeFile(output, invoiceHtml, function (err) {
                        callback(err, invoiceHtml);
                    });
                    return;
                }

                // Callback the data
                callback(null, invoiceHtml);
            });

            return this;
        }

        /**
         * convertToSecondary
         * Converts a currency into another currency according to the currency
         * balance provided in the options
         *
         * @name convertToSecondary
         * @function
         * @param {Number} input The number that should be converted
         * @return {Number} The converted input
         */

    }, {
        key: "convertToSecondary",
        value: function convertToSecondary(input) {
            return input * this.options.data.currencyBalance.secondary / this.options.data.currencyBalance.main;
        }

        /**
         * toPdf
         * Renders invoice as pdf
         *
         * @name toPdf
         * @function
         * @param {Object|String|Stream} options The path the output pdf file, the
         * stream object, or an object containing:
         *
         *  - `output` (String|Stream): The path to the output file or the stream object.
         *  - `converter` (Object): An object containing custom settings for the [`phantom-html-to-pdf`](https://github.com/pofider/phantom-html-to-pdf).
         *
         * @param {Function} callback The callback function
         * @return {Invoice} The Invoice instance
         */

    }, {
        key: "toPdf",
        value: function toPdf(ops, callback) {

            var ev = new EventEmitter(),
                opsIsStream = isStream(ops),
                noStream = false;

            callback = callback || noop;
            if (typeof ops === "function") {
                callback = ops;
                ops = {};
            }

            if (typeof ops === "string" || opsIsStream) {
                ops = { output: ops };
            }

            if (!opsIsStream && typeof ops.output === "string") {
                ops.output = fs.createWriteStream(ops.output);
            }

            noStream = !isStream(ops.output);

            ops = ul.deepMerge(ops, {
                converter: {
                    viewportSize: {
                        width: 2970,
                        height: 4200
                    },
                    paperSize: {
                        format: "A3"
                    }
                }
            });

            oneByOne([this.toHtml.bind(this), function (next, html) {
                ops.converter.html = html;
                htmlPdf(ops.converter, next);
            }, function (next, pdf) {

                if (noStream) {
                    return next(null, pdf);
                }

                var err = [];
                ops.output.on("error", function (err) {
                    return err.push(err);
                });
                pdf.stream.on("end", function () {
                    if (err.length) {
                        return next(err.length === 1 ? err[0] : err);
                    }
                    next(null, pdf);
                });
                pdf.stream.pipe(ops.output);
            }], function (err, data) {
                callback(err, data[1], data[0]);
            });
        }
    }]);

    return NodeIce;
}();
