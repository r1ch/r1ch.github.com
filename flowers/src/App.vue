<template>
  <div id="app" @click = "init">
  </div>
</template>

<script>
const d3 = require("d3");
const P = require("./poisson");

export default {
  name: 'App',
  data: function(){
    return {text:"bradish"}
  },
  mounted: async function(){
    console.log(this)
    //Not Reactive - by design
    const full = {
      width : 1200,
      height : 600
    };
    const margin = {
      top : 10,
      left : 10,
      right : 10,
      bottom : 10
    };
    this.full = full;
    this.margin = margin;
    this.inner = {
        width : full.width - margin.left - margin.right,
        height : full.height - margin.top - margin.bottom
    };

    this.canvas = document.createElement('canvas')
		this.canvas.width = this.full.width
		this.canvas.height = this.full.height

    this.context = this.canvas.getContext('2d');
    this.context.font = `${this.full.width/4}px sans-serif`;
    this.context.fillStyle = "red";
    this.context.textAlign = "center"
    this.context.textBaseline = 'middle'
    this.context.fillText(this.text, this.full.width/2, this.full.height/2); 

    this.svg = d3.select("#app")
      .style("padding-bottom", `${Math.ceil(this.full.height*100/this.full.width)}%`)
      .append("svg")
      .attr("viewBox", "0 0 " + this.full.width + " " + this.full.height)
      .attr("width",this.full.width)
      .attr("height",this.full.height)
      .append("g")
      .attr("width",this.inner.width)
      .attr("width",this.inner.height)
      .attr("transform",`translate(${this.margin.left,this.margin.top})`);

    this.petal = d3
    .scaleLinear()
    .domain([0,0.5,1])
    .range(["salmon", "lemonchiffon", "gold"])

    this.sepal = d3
    .scaleLinear()
    .domain([0,1])
    .range(["red", "yellow"])

    this.carpal = d3
    .scaleLinear()
    .domain([0,1])
    .range(["rosybrown", "saddlebrown"])

    this.stamen = d3
    .scaleLinear()
    .domain([0,1])
    .range(["white", "darkgrey"])

    this.stem = d3
    .scaleLinear()
    .domain([0,0.5,1])
    .range(["lightgreen", "green", "darkgreen"])

    /*this.stem = this.stamen = this.carpal = this.sepal = this.petal = d3
    .scaleLinear()
    .domain([0,0.25,0.5,1])
    .range(["black", "darkgrey", "grey", "lightgrey"])*/

    this.init();
  },
  methods:{
    next: () => new Promise(resolve => setImmediate(resolve)),
    sleep: ms => new Promise(resolve => setTimeout(resolve,ms)),
    init: async function(){
      this.parts = []
      for(const dot of P(this.inner.width,this.inner.height,10,this.context)){
        this.parts.push(dot)
        await this.next()
      }
      this.parts.sort((a,b)=>a.add[2]-b.add[2])
      this.draw();
    },
    draw: function(){
      this.svg.selectAll("*").remove()

      this.svg.selectAll(".stem")
      .data(this.parts)
      .join(
        enter=>
        enter
        .append("path")
        .attr("class","stem")
        .classed("inside",d=>d.inside)
        .attr("stroke",()=>this.stem(Math.random()))
        .attr("stroke-width",d=>(Math.random()*2+1+(d.inside?1:0))|0)
        .attr("d",d=>`M${d.parent[0]},${d.parent[1]}L${d.parent[0]},${d.parent[1]}`)
        .call(enter=>enter
          .transition()
          .delay(d=>d.add[2]*100)
          .duration(200)
          .attr("d",d=>`M${d.add[0]},${d.add[1]}L${d.parent[0]},${d.parent[1]}`)
          .attr("stroke-linecap","round")
        )
      )

      this.svg.selectAll(".flower")
      .data(
        this.parts
        .filter(part=>part.inside)
        .map(part=>({
          ...part,
          size: (Math.random()*8+2) | 0,
          delay: 150*part.add[2] + 100 * Math.random()
        }))
      )
      .join(
        enter=>
        enter
        .append("g")
        .attr("class","flower")
        .call(
          enter=>enter
          .append("circle")
          .attr("class","flower outer")
          .attr("cx",d=>d.add[0])
          .attr("cy",d=>d.add[1])
          .attr("r",0)
          .attr("stroke-width",0)
          .attr("stroke", ()=>this.petal(Math.random()))
          .attr("fill", ()=>this.sepal(Math.random()))
          .call(enter=>enter
            .transition()
            .delay(d=>d.delay)
            .duration(1000)
            .attr("r",d=>d.size)
            .attr("stroke-width",d=>d.size*1.5)
          )
        )
        .call(
          enter=>enter
          .append("circle")
          .attr("class","flower inner")
          .attr("cx",d=>d.add[0])
          .attr("cy",d=>d.add[1])
          .attr("r",0)
          .attr("stroke", ()=>this.stamen(Math.random()))
          .attr("fill", ()=>this.carpal(Math.random()))
          .call(enter=>enter
            .transition()
            .delay(d=>d.add[2]*100+200)
            .attr("r",1)
          )
          .call(enter=>enter
            .transition()
            .delay(d=>d.delay)
            .duration(1000)
            .attr("r",d=>d.size/2)
          )
        )
      )
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  width:100%;
  position: relative;
  height: 0;
  width: 100%;
  padding: 0;
  padding-top: 200px;
  padding-bottom: 100%;
}

#app > svg {
    position: absolute;
    height: 100%;
    width: 100%;
    left: 0;
    top: 0;
}

svg {
  display:block;
  margin: 200 auto;
}

canvas{
  display: hidden
}

.flower.outer {
  stroke-dasharray: 2 .5;
}


.flower.inner {
  stroke-dasharray: 1 1;
}
</style>
