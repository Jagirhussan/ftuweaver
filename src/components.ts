// @ts-nocheck

export class JSONViewer {
    private _dom: any

    public constructor() {
        this._dom = {}  as any;
        this._dom.container = document.createElement("pre");
        this._dom.container.classList.add("json-viewer");
    };

    /**
     * Visualise JSON object.
     * 
     * @param {Object|Array} json Input value
     * @param {Number} [maxLvl] Process only to max level, where 0..n, -1 unlimited
     * @param {Number} [colAt] Collapse at level, where 0..n, -1 unlimited
     */
    public showJSON(json, maxLvl, colAt) {
        maxLvl = typeof maxLvl === "number" ? maxLvl : -1; // max level
        colAt = typeof colAt === "number" ? colAt : -1; // collapse at

        var jsonData = this._processInput(json);
        var walkEl = this._walk(jsonData, maxLvl, colAt, 0);

        this._dom.container.innerHTML = "";
        this._dom.container.appendChild(walkEl);
    };

    /**
     * Get container with pre object - this container is used for visualise JSON data.
     * 
     * @return {Element}
     */
    public getContainer(): HTMLElement {
        return this._dom.container;
    };

    /**
     * Process input JSON - throws exception for unrecognized input.
     * 
     * @param {Object|Array} json Input value
     * @return {Object|Array}
     */
    private _processInput(json: any): any {
        if (json && typeof json === "object") {
            return json;
        } else {
            throw "Input value is not object or array!";
        }
    };

    /**
     * Recursive walk for input value.
     * 
     * @param {Object|Array} value Input value
     * @param {Number} maxLvl Process only to max level, where 0..n, -1 unlimited
     * @param {Number} colAt Collapse at level, where 0..n, -1 unlimited
     * @param {Number} lvl Current level
     */
    private _walk(value: any, maxLvl: number, colAt: number, lvl: number) {
        var frag = document.createDocumentFragment();
        var isMaxLvl = maxLvl >= 0 && lvl >= maxLvl;
        var isCollapse = colAt >= 0 && lvl >= colAt;

        switch (typeof(value)) {
            case "object":
                if (value) {
                    var isArray = Array.isArray(value);
                    var items = isArray ? value : Object.keys(value);

                    if (lvl === 0) {
                        // root level
                        var rootCount = this._createItemsCount(items.length);
                        // hide/show
                        var rootLink = this._createLink(isArray ? "[" : "{");

                        if (items.length) {
                            rootLink.addEventListener("click", function() {
                                if (isMaxLvl) return;

                                rootLink.classList.toggle("collapsed");
                                rootCount.classList.toggle("hide");

                                // main list
                                this._dom.container.querySelector("ul").classList.toggle("hide");
                            }.bind(this));

                            if (isCollapse) {
                                rootLink.classList.add("collapsed");
                                rootCount.classList.remove("hide");
                            }
                        } else {
                            rootLink.classList.add("empty");
                        }

                        rootLink.appendChild(rootCount);
                        frag.appendChild(rootLink);
                    }

                    if (items.length && !isMaxLvl) {
                        var len = items.length - 1;
                        var ulList = document.createElement("ul");
                        ulList.setAttribute("data-level", lvl);
                        ulList.classList.add("type-" + (isArray ? "array" : "object"));

                        items.forEach(function(key, ind) {
                            var item = isArray ? key : value[key];
                            var li = document.createElement("li");

                            if (typeof item === "object") {
                                var isEmpty = false;

                                // null && date
                                if (!item || item instanceof Date) {
                                    li.appendChild(document.createTextNode(isArray ? "" : key + ": "));
                                    li.appendChild(this._createSimple(item ? item : null));
                                }
                                // array & object
                                else {
                                    var itemIsArray = Array.isArray(item);
                                    var itemLen = itemIsArray ? item.length : Object.keys(item).length;

                                    // empty
                                    if (!itemLen) {
                                        li.appendChild(document.createTextNode(key + ": " + (itemIsArray ? "[]" : "{}")));
                                    } else {
                                        // 1+ items
                                        var itemTitle = (typeof key === "string" ? key + ": " : "") + (itemIsArray ? "[" : "{");
                                        var itemLink = this._createLink(itemTitle);
                                        var itemsCount = this._createItemsCount(itemLen);

                                        // maxLvl - only text, no link
                                        if (maxLvl >= 0 && lvl + 1 >= maxLvl) {
                                            li.appendChild(document.createTextNode(itemTitle));
                                        } else {
                                            itemLink.appendChild(itemsCount);
                                            li.appendChild(itemLink);
                                        }

                                        li.appendChild(this._walk(item, maxLvl, colAt, lvl + 1));
                                        li.appendChild(document.createTextNode(itemIsArray ? "]" : "}"));

                                        var list = li.querySelector("ul");
                                        var itemLinkCb = function() {
                                            itemLink.classList.toggle("collapsed");
                                            itemsCount.classList.toggle("hide");
                                            list.classList.toggle("hide");
                                        };

                                        // hide/show
                                        itemLink.addEventListener("click", itemLinkCb);

                                        // collapse lower level
                                        if (colAt >= 0 && lvl + 1 >= colAt) {
                                            itemLinkCb();
                                        }
                                    }
                                }
                            }
                            // simple values
                            else {
                                // object keys with key:
                                if (!isArray) {
                                    li.appendChild(document.createTextNode(key + ": "));
                                }

                                // recursive
                                li.appendChild(this._walk(item, maxLvl, colAt, lvl + 1));
                            }

                            // add comma to the end
                            if (ind < len) {
                                li.appendChild(document.createTextNode(","));
                            }

                            ulList.appendChild(li);
                        }, this);

                        frag.appendChild(ulList);
                    } else if (items.length && isMaxLvl) {
                        var itemsCount = this._createItemsCount(items.length);
                        itemsCount.classList.remove("hide");

                        frag.appendChild(itemsCount);
                    }

                    if (lvl === 0) {
                        // empty root
                        if (!items.length) {
                            var itemsCount = this._createItemsCount(0);
                            itemsCount.classList.remove("hide");

                            frag.appendChild(itemsCount);
                        }

                        // root cover
                        frag.appendChild(document.createTextNode(isArray ? "]" : "}"));

                        // collapse
                        if (isCollapse) {
                            frag.querySelector("ul").classList.add("hide");
                        }
                    }
                    break;
                }

            default:
                // simple values
                frag.appendChild(this._createSimple(value));
                break;
        }

        return frag;
    };

    /**
     * Create simple value (no object|array).
     * 
     * @param  {Number|String|null|undefined|Date} value Input value
     * @return {Element}
     */
    private _createSimple(value: Any) {
        var spanEl = document.createElement("span");
        var type = typeof(value);
        var txt = value;

        if (type === "string") {
            txt = '"' + value + '"';
        } else if (value === null) {
            type = "null";
            txt = "null";
        } else if (value === undefined) {
            txt = "undefined";
        } else if (value instanceof Date) {
            type = "date";
            txt = value.toString();
        }

        spanEl.classList.add("type-" + type);
        spanEl.innerHTML = txt;

        return spanEl;
    };

    /**
     * Create items count element.
     * 
     * @param  {Number} count Items count
     * @return {Element}
     */
    private _createItemsCount(count) {
        var itemsCount = document.createElement("span");
        itemsCount.classList.add("items-ph");
        itemsCount.classList.add("hide");
        itemsCount.innerHTML = this._getItemsTitle(count);

        return itemsCount;
    };

    /**
     * Create clickable link.
     * 
     * @param  {String} title Link title
     * @return {Element}
     */
    private _createLink(title) {
        var linkEl = document.createElement("a");
        linkEl.classList.add("list-link");
        linkEl.href = "javascript:void(0)";
        linkEl.innerHTML = title || "";

        return linkEl;
    };

    /**
     * Get correct item|s title for count.
     * 
     * @param  {Number} count Items count
     * @return {String}
     */
    private _getItemsTitle(count) {
        var itemsTxt = count > 1 || count === 0 ? "items" : "item";

        return (count + " " + itemsTxt);
    };
}

export class PHSLatexGenerator {
    private targetDiv: HTMLDivElement
    private latex: string

    public constructor(target: HTMLDivElement) {
        this.targetDiv = target;
        this.latex = '';
    }

    public fraction(input) {
        var re = /\\frac\s*{((?!\\frac{).*?)}{((?!\\frac{).*?)}/;
        let parent = this;
        input = input.replace(re, function(tot, a, b) {
            //bMatch = true;
            return '\\frac{' + parent._handleUnderScoresAndCarets(a) + '}{' + parent._handleUnderScoresAndCarets(b) + '}';
        });
        return input;
    }

    private _handleUnderScoresAndCarets(ltx: string): string {
        if (ltx.indexOf('{') > 0 && ltx.indexOf('frac') < 0) { //If there are curly braces in the string, assume that it has been formatted properly and return
            return ltx;
        }
        if (ltx.indexOf('frac') > 0) { //If there are curly braces in the string, assume that it has been formatted properly and return
            return this.fraction(ltx);
        }
        let wstr = ltx;

        //Find ^
        let cindx = ltx.indexOf('^');
        let cstr = ''
        if (cindx > -1) {
            //find the _ after cindex
            let ec = ltx.indexOf('_', cindx + 1);
            if (ec == -1)
                ec = ltx.length;
            cstr = ltx.substring(cindx, ec);
            wstr = ltx.replaceAll(cstr, '');
        }
        let uindx = wstr.indexOf('_');
        let ustr = ''
        if (uindx > -1) {
            ustr = ltx.substring(uindx, wstr.length);
            wstr = ltx.substring(0, uindx);
            ustr = ustr.replaceAll('_', '');
        }
        let res = wstr;
        if (cindx > -1) {
            res = res + '^{' + cstr + '}';
        }
        if (uindx > -1) {
            res = res + '_{' + ustr + '}';
        }

        return res;
    }


    private handleUnderScoresAndCarets(ltx: string): string {
        if (ltx.indexOf('frac') > 0) { //If there are curly braces in the string, assume that it has been formatted properly and return
            return this.fraction(ltx);
        } else if (ltx.indexOf(' ') == -1) {
            return this._handleUnderScoresAndCarets(ltx);
        } else {
            let blocks = ltx.split(' ');
            let tex = '';
            for (let i = 0; i < blocks.length; i++) {
                tex = tex + this._handleUnderScoresAndCarets(blocks[i]) + ' ';
            }
            return tex;
        }
    }


    private generateMatrix(phsM: Object): string {
        let tex = '';
        if ('rows' in phsM && 'cols' in phsM) {
            let r = phsM['rows'] as number;
            let c = phsM['cols'] as number;
            if (r == 0 && c == 0) {
                return '\\boldsymbol{0}';
            }
            let elems = phsM['elements'];
            tex = `\\begin{bmatrix}
            `;
            for (let i = 0; i < r; i++) {
                tex = tex + this.handleUnderScoresAndCarets(elems[i * c]);
                for (let j = 1; j < c; j++) {
                    tex = tex + ` &` + this.handleUnderScoresAndCarets(elems[i * c + j]);
                }
                tex = tex + `\\\\`;
            }
            tex = tex.substring(0, tex.length - 2); //Remove the \\ for the last row, the escape `\` doesnt count
            tex = tex + `
            \\end{bmatrix}`;
        }
        return tex;
    }


    public generate(phs_: Object, provenance: Object) {
        let generateMatrix = true;
        if ('warning' in phs_) {
            generateMatrix = false;
            this.targetDiv.innerHTML = `A valid port hamiltonian DAE does not exist! <br> ${phs['warning']}`;
            return generateMatrix;
        }
        let parameterLatex = `<table id="phsparametervalues">
                                    <tr><th>Parameter</th>
                                    <th>Value</th>
                                    <th>SI Units</th>
                                    </tr>`; 
        const pv = phs_['parameter_values'];
        let pvx = JSON.stringify(phs_);
        for (const k in pv) {
            const nk = this.handleUnderScoresAndCarets(k);
            let r = `<tr>
                <td style="text-align: center; vertical-align: middle;">$${nk}$</td>
                <td data-key="${k}" data-init="${pv[k]["value"]}" contenteditable='true'>${pv[k]["value"]}</td>
                <td data-key="${k}" data-init="${pv[k]["units"]}" contenteditable='true'>${pv[k]["units"]}</td>
            </tr>`;
            parameterLatex += r;
            pvx = pvx.replaceAll(k, nk);
        }
        parameterLatex += `</table>`;
        const svv = phs_['stateVector']['elements'];
        let statedesc = {};
        for (const k in svv) {
            const nk = this.handleUnderScoresAndCarets(svv[k]);
            pvx = pvx.replaceAll(svv[k], nk);
        }
        if('state_values' in phs_){
            statedesc = phs_['state_values'];
        }else{
            for (const k in svv) {
                statedesc[svv[k]] = {"value":0.0,"units":"dimensionless"};
            }
        }
        let stateInitialValueLatex = `<table id="phsstateinitialvalues">
        <tr><th>State Variable</th>
        <th>Initial Value</th>
        <th>SI Units</th>
        </tr>`;         
        for (const k in statedesc) {
            const nk = this.handleUnderScoresAndCarets(k);
            let r = `<tr>
                <td style="text-align: center; vertical-align: middle;">$${nk}$</td>
                <td data-key="${k}" data-init="${statedesc[k]["value"]}" contenteditable='true'>${statedesc[k]["value"]}</td>
                <td data-key="${k}" data-init="${statedesc[k]["units"]}" contenteditable='true'>${statedesc[k]["units"]}</td>
            </tr>`;
            stateInitialValueLatex += r;
        }
        stateInitialValueLatex += `</table>`;  
        parameterLatex = `<table ><tr><td>${parameterLatex}</td><td>&nbsp;&nbsp;&nbsp;&nbsp;</td><td style="vertical-align:top">${stateInitialValueLatex}</td></tr></table>`
        
        const phs = JSON.parse(pvx);
        const unames = phs['portHamiltonianMatrices']["u"]["elements"];
        let usplit = null;
        if('u_split' in phs['portHamiltonianMatrices']){
            usplit = phs['portHamiltonianMatrices']['u_split']['elements'];
        }else{
            usplit = [];
            for(let x=0;x<unames.length;x++){
                usplit.push("");
            }
        }
        let uconnectboundary = null;
        if('u_connect2boundary' in phs['portHamiltonianMatrices']){
            uconnectboundary = phs['portHamiltonianMatrices']['u_connect2boundary']['elements'];
        }else{
            uconnectboundary = [];
            for(let x=0;x<unames.length;x++){
                uconnectboundary.push("");
            }
        }
        let utypelatex = `<table id="upotentialtypes" style="border:1px solid blue;"> 
        <tr>
        <th style="border:1px solid blue;">Input Component</th>
        <th style="border:1px solid blue; display:none">Is Potential</th>
        <th style="border:1px solid blue;">Interconnection Network ID</th>
        <th style="border:1px solid blue; display:none">Connect to boundary where available</th>
        </tr>
        `;
        if("u_ispotential" in phs['portHamiltonianMatrices']){           
            const utype = phs['portHamiltonianMatrices']["u_ispotential"]["elements"];

            for(const k in utype){
                let cbx = utype[k]?"checked":"";
                let cbu = usplit[k];
                let cbb = uconnectboundary[k]?"checked":"";
                let r = `<tr>
                    <td class="phsuserdata" style="border:1px solid blue; text-align: center; vertical-align: middle;">$${unames[k]}$</td>
                    <td class="phsuserdata" style="border:1px solid blue; display:none;" data-key="${k}" data-init=${utype[k]} style="text-align: center;vertical-align: middle;"><input type="checkbox" ${cbx} /></td>
                    <td class="phsuserdata" style="border:1px solid blue;" data-key="${k}" data-init=${usplit[k]} style="text-align: center;vertical-align: middle;" ><input type="number" value=${cbu} /></td>
                    <td class="phsuserdata" style="border:1px solid blue; display:none;" data-key="${k}" data-init=${uconnectboundary[k]} style="text-align: center;vertical-align: middle;" ><input type="checkbox" ${cbb} /></td>                                                            
                </tr>`;
                utypelatex += r;
            }
            utypelatex += `</table>`;
        }else{ //Use the u vector and expect the user to set it
            
            for(const k in unames){
                let cbx = "";
                let cbu = usplit[k];
                let cbb = uconnectboundary[k]?"checked":"";
                let r = `<tr>
                    <td class="phsuserdata" style="border:1px solid blue;text-align: center; vertical-align: middle;">$${unames[k]}$</td>
                    <td class="phsuserdata" style="border:1px solid blue; display:none;" data-key="${k}" data-init=${false} style="text-align: center;vertical-align: middle;" ><input type="checkbox" ${cbx} /></td>
                    <td class="phsuserdata" style="border:1px solid blue;" data-key="${k}" data-init=${usplit[k]} style="text-align: center;vertical-align: middle;" ><input type="number" value=${cbu} /></td>                                        
                    <td class="phsuserdata" style="border:1px solid blue; display:none;" data-key="${k}" data-init=${uconnectboundary[k]} style="text-align: center;vertical-align: middle;" ><input type="checkbox" ${cbb} /></td>                                                                                
                </tr>`;
                utypelatex += r;
            }
            utypelatex += `</table>`;
        }
        let phenomenologicalMark = '';
        if('isphenomenological' in phs){
            if(phs['isphenomenological']){
                phenomenologicalMark = '&nbsp<small style="color:red">Computed as $1/2 x^T Q x$ </small>'
            }
        }
        let bmatSymbol = '\\boldsymbol{B}';
        let bbarcap = '';
        if("matBhat" in phs['portHamiltonianMatrices']){
            if(phs['portHamiltonianMatrices']["matBhat"]["elements"].length>0){
                bbarcap = `           <tr>           
                    <td>
                    $            
                    \\bar{\\boldsymbol{B}} = ${this.generateMatrix(phs['portHamiltonianMatrices']['matBhat'])}
                    $
                    </td>
                </tr>`;
                bmatSymbol = '\\hat{\\boldsymbol{B}}';
            }
        }
        if("matC" in phs['portHamiltonianMatrices']){
            if(phs['portHamiltonianMatrices']["matC"]["elements"].length>0){
            bbarcap += `           <tr>           
                    <td>
                    $            
                    \\hat{\\boldsymbol{C}} = ${this.generateMatrix(phs['portHamiltonianMatrices']['matC'])}
                    $
                    </td>
                </tr>`
            }
        }


        let latexText: string = `<div><center><b>Port Hamiltonian</b></center></div><div style="max-height: 350px; overflow-y: scroll; margin-left: 20px;">
        <table>
        <tr>
           <td>
              StateVector: $\\begin{eqnarray}\\boldsymbol{x} = ${this.generateMatrix(phs['stateVector'])}\\end{eqnarray}$
           </td>
        </tr>
        <tr>
           <td>
              $\\mathcal{H} = ${phs['hamiltonianLatex']}$ ${phenomenologicalMark}
           </td>
           </tr>
           <tr>           
           <td>
            $            
            \\frac{\\partial \\mathcal{H}(\\boldsymbol{x})}{\\partial x_i} = ${this.generateMatrix(phs['Hderivatives'])}
            $
           </td>
        </tr>
        <tr>
           <td>
              $
              \\boldsymbol{J} = ${this.generateMatrix(phs['portHamiltonianMatrices']['matJ'])}
              $
           </td>
           </tr>
           <tr>           
           <td>
              $   
              \\boldsymbol{R} = ${this.generateMatrix(phs['portHamiltonianMatrices']['matR'])}
              $
           </td>
           </tr>
           <tr>           
           <td>
              $            
              ${bmatSymbol} = ${this.generateMatrix(phs['portHamiltonianMatrices']['matB'])}
              $
           </td>
        </tr>
        <tr>
           <td>
              $            
              \\boldsymbol{E} = ${this.generateMatrix(phs['portHamiltonianMatrices']['matE'])}
              $
           </td>
           </tr>
           <tr>           
           <td>
              $            
              \\boldsymbol{Q} = ${this.generateMatrix(phs['portHamiltonianMatrices']['matQ'])}
              $
           </td>
           </tr>
           ${bbarcap}
           <tr>           
           <td>
              $
              \\boldsymbol{u} = ${this.generateMatrix(phs['portHamiltonianMatrices']['u'])}
              $
           </td>
        </tr>
     </table>
     </div>
     <br>
    <div style="max-height: 200px; overflow-y: scroll;margin-left: 20px;">
        <table>
            <tr>
            <td>
            <div style="display: inline-block">
                <!-- <div><b>Parameter values</b></div> -->
                <div>
                    ${parameterLatex}
                </div>
            </div>
            </td>
            <td style="vertical-align: top; text-align: right;">
            <div style="display: inline-block;margin-left: 100px;">
                <!-- <div><b>Input component types</b></div> -->
                <div>
                    ${utypelatex}
                </div>
            </div>
            </td>
            </tr>
        </table>
    </div>
`;

        this.targetDiv.innerHTML = latexText;
        return generateMatrix;
    }

};
