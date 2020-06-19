(function(t){function e(e){for(var r,c,o=e[0],u=e[1],s=e[2],l=0,d=[];l<o.length;l++)c=o[l],Object.prototype.hasOwnProperty.call(a,c)&&a[c]&&d.push(a[c][0]),a[c]=0;for(r in u)Object.prototype.hasOwnProperty.call(u,r)&&(t[r]=u[r]);h&&h(e);while(d.length)d.shift()();return i.push.apply(i,s||[]),n()}function n(){for(var t,e=0;e<i.length;e++){for(var n=i[e],r=!0,o=1;o<n.length;o++){var u=n[o];0!==a[u]&&(r=!1)}r&&(i.splice(e--,1),t=c(c.s=n[0]))}return t}var r={},a={app:0},i=[];function c(e){if(r[e])return r[e].exports;var n=r[e]={i:e,l:!1,exports:{}};return t[e].call(n.exports,n,n.exports,c),n.l=!0,n.exports}c.m=t,c.c=r,c.d=function(t,e,n){c.o(t,e)||Object.defineProperty(t,e,{enumerable:!0,get:n})},c.r=function(t){"undefined"!==typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},c.t=function(t,e){if(1&e&&(t=c(t)),8&e)return t;if(4&e&&"object"===typeof t&&t&&t.__esModule)return t;var n=Object.create(null);if(c.r(n),Object.defineProperty(n,"default",{enumerable:!0,value:t}),2&e&&"string"!=typeof t)for(var r in t)c.d(n,r,function(e){return t[e]}.bind(null,r));return n},c.n=function(t){var e=t&&t.__esModule?function(){return t["default"]}:function(){return t};return c.d(e,"a",e),e},c.o=function(t,e){return Object.prototype.hasOwnProperty.call(t,e)},c.p="/";var o=window["webpackJsonp"]=window["webpackJsonp"]||[],u=o.push.bind(o);o.push=e,o=o.slice();for(var s=0;s<o.length;s++)e(o[s]);var h=u;i.push([0,"chunk-vendors"]),n()})({0:function(t,e,n){t.exports=n("56d7")},"034f":function(t,e,n){"use strict";var r=n("85ec"),a=n.n(r);a.a},"56d7":function(t,e,n){"use strict";n.r(e);n("e260"),n("e6cf"),n("cca6"),n("a79d");var r=n("2b0e"),a=function(){var t=this,e=t.$createElement,n=t._self._c||e;return n("div",{attrs:{id:"app"},on:{click:t.init}})},i=[],c=(n("99af"),n("4de4"),n("a15b"),n("d81d"),n("d3b7"),n("130f"),n("5530")),o=n("b85c"),u=(n("96cf"),n("1da1")),s=n("5698"),h=n("da0a"),l={name:"App",data:function(){return{text:"404"}},mounted:function(){var t=Object(u["a"])(regeneratorRuntime.mark((function t(){var e,n;return regeneratorRuntime.wrap((function(t){while(1)switch(t.prev=t.next){case 0:e={width:1200,height:600},n={top:10,left:10,right:10,bottom:10},this.full=e,this.margin=n,this.inner={width:e.width-n.left-n.right,height:e.height-n.top-n.bottom},this.canvas=document.createElement("canvas"),this.canvas.width=this.full.width,this.canvas.height=this.full.height,this.context=this.canvas.getContext("2d"),this.context.font="300px Helvetica",this.context.fillStyle="red",this.context.textAlign="center",this.context.textBaseline="middle",this.svg=s.select("#app").style("padding-bottom","".concat(Math.ceil(100*this.full.height/this.full.width),"%")).append("svg").attr("viewBox","0 0 "+this.full.width+" "+this.full.height).attr("width",this.full.width).attr("height",this.full.height).append("g").attr("width",this.inner.width).attr("width",this.inner.height).attr("transform","translate(".concat((this.margin.left,this.margin.top),")")),this.init();case 15:case"end":return t.stop()}}),t,this)})));function e(){return t.apply(this,arguments)}return e}(),methods:{next:function(){return new Promise((function(t){return setImmediate(t)}))},sleep:function(t){return new Promise((function(e){return setTimeout(e,t)}))},init:function(){var t=Object(u["a"])(regeneratorRuntime.mark((function t(){var e,n,r;return regeneratorRuntime.wrap((function(t){while(1)switch(t.prev=t.next){case 0:this.context.clearRect(0,0,this.full.width,this.full.height),this.context.fillText(this.text,this.full.width/2,this.full.height/2),this.parts=[],e=Object(o["a"])(h(this.inner.width,this.inner.height,10,this.context)),t.prev=4,e.s();case 6:if((n=e.n()).done){t.next=13;break}return r=n.value,this.parts.push(r),t.next=11,this.next();case 11:t.next=6;break;case 13:t.next=18;break;case 15:t.prev=15,t.t0=t["catch"](4),e.e(t.t0);case 18:return t.prev=18,e.f(),t.finish(18);case 21:this.parts.sort((function(t,e){return t.add[2]-e.add[2]})),this.draw();case 23:case"end":return t.stop()}}),t,this,[[4,15,18,21]])})));function e(){return t.apply(this,arguments)}return e}(),draw:function(){this.svg.selectAll("*").remove(),this.svg.selectAll(".stem").data(this.parts).join((function(t){return t.append("path").attr("class","stem").classed("inside",(function(t){return t.inside})).attr("d",(function(t){return"M".concat(t.parent[0],",").concat(t.parent[1],"L").concat(t.parent[0],",").concat(t.parent[1])})).call((function(t){return t.transition().delay((function(t){return 100*t.add[2]})).duration(200).attr("d",(function(t){return"M".concat(t.add[0],",").concat(t.add[1],"L").concat(t.parent[0],",").concat(t.parent[1])}))}))})),this.svg.selectAll(".flower").data(this.parts.filter((function(t){return t.inside})).map((function(t){return Object(c["a"])(Object(c["a"])({},t),{},{size:8*Math.random()+2|0,delay:150*t.add[2]+100*Math.random()})}))).join((function(t){return t.append("g").attr("class","flower").call((function(t){return t.append("circle").attr("class","flower outer").attr("cx",(function(t){return t.add[0]})).attr("cy",(function(t){return t.add[1]})).attr("r",0).attr("stroke-width",0).attr("fill",(function(){return Math.random()>.5?"darkgrey":"lightgrey"})).attr("stroke",(function(){return Math.random()>.5?"grey":"black"})).call((function(t){return t.transition().delay((function(t){return t.delay})).duration(1e3).attr("r",(function(t){return t.size})).attr("stroke-width",10)}))})).call((function(t){return t.append("circle").attr("class","flower inner").attr("cx",(function(t){return t.add[0]})).attr("cy",(function(t){return t.add[1]})).attr("r",0).call((function(t){return t.transition().delay((function(t){return 100*t.add[2]+200})).attr("r",1)})).call((function(t){return t.transition().delay((function(t){return t.delay})).duration(1e3).attr("r",(function(t){return t.size/2}))}))}))}))}}},d=l,f=(n("034f"),n("2877")),p=Object(f["a"])(d,a,i,!1,null,null,null),g=p.exports;r["a"].config.productionTip=!1,new r["a"]({render:function(t){return t(g)}}).$mount("#app")},"85ec":function(t,e,n){},da0a:function(t,e,n){n("96cf");var r=regeneratorRuntime.mark(a);function a(t,e,n,a){var i,c,o,u,s,h,l,d,f,p,g,m,v,w,x,b,y,M,k;return regeneratorRuntime.wrap((function(r){while(1)switch(r.prev=r.next){case 0:return k=function(t,e,n){var r=l[s*(e/u|0)+(t/u|0)]=[t,e,n];return d.push(r),r},M=function(t,e){for(var n=t/u|0,r=e/u|0,a=Math.max(n-2,0),i=Math.max(r-2,0),o=Math.min(n+3,s),d=Math.min(r+3,h),f=i;f<d;++f)for(var p=f*s,g=a;g<o;++g){var m=l[p+g];if(m){var v=m[0]-t,w=m[1]-e;if(v*v+w*w<c)return!1}}return!0},i=15,c=n*n,o=3*c,u=n*Math.SQRT1_2,s=Math.ceil(t/u),h=Math.ceil(e/u),l=new Array(s*h),d=[],r.next=12,{add:k(t/2,e/2,0),parent:[t/2,e/2],inside:!1};case 12:if(!d.length){r.next=33;break}f=Math.random()*d.length|0,p=d[f],g=0;case 16:if(!(g<i)){r.next=29;break}if(m=2*Math.PI*Math.random(),v=Math.sqrt(Math.random()*o+c),w=p[0]+v*Math.cos(m),x=p[1]+v*Math.sin(m),!(0<=w&&w<t&&0<=x&&x<e&&M(w,x))){r.next=26;break}return b=a.getImageData(0|w,0|x,1,1).data[0],r.next=25,{add:k(w,x,p[2]+1),parent:p,inside:b};case 25:return r.abrupt("continue",12);case 26:++g,r.next=16;break;case 29:y=d.pop(),f<d.length&&(d[f]=y),r.next=12;break;case 33:case"end":return r.stop()}}),r)}t.exports=a}});
//# sourceMappingURL=app.e65f00b2.js.map