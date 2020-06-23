import * as d3 from 'd3';
import { PoissonDiscSampler } from "./poisson"

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

const inner = {
    width : full.width - margin.left - margin.right,
    height : full.height - margin.top - margin.bottom
};

let petal, sepal, carpal, stamen, stem, context, svg;

export const mount = function(text, dull){
    const canvas = document.createElement('canvas')
    canvas.width = full.width
    canvas.height = full.height

    context = canvas.getContext('2d');
    context.font = `${full.width/4}px sans-serif`;
    context.fillStyle = "red";
    context.textAlign = "center"
    context.textBaseline = 'middle'
    context.fillText(text, full.width/2, full.height/2); 

    svg = d3.select("#app")
        .style("padding-bottom", `${Math.ceil(full.height*100/full.width)}%`)
        .append("svg")
        .attr("viewBox", "0 0 " + full.width + " " + full.height)
        .attr("width",full.width)
        .attr("height",full.height)
        .append("g")
        .attr("width",inner.width)
        .attr("width",inner.height)
        .attr("transform",`translate(${margin.left,margin.top})`);

    if(!dull){
        petal = d3
            .scaleLinear()
            .domain([0,0.5,1])
            .range(["salmon", "lemonchiffon", "gold"]);

        sepal = d3
            .scaleLinear()
            .domain([0,1])
            .range(["red", "yellow"]);

        carpal = d3
            .scaleLinear()
            .domain([0,1])
            .range(["rosybrown", "saddlebrown"]);

        stamen = d3
            .scaleLinear()
            .domain([0,1])
            .range(["white", "darkgrey"]);

        stem = d3
            .scaleLinear()
            .domain([0,0.5,1])
            .range(["lightgreen", "green", "darkgreen"]);
    } else {
        petal = sepal = carpal = stamen = stem = d3
        .scaleLinear()
        .domain([0,0.25,0.5,1])
        .range(["black", "darkgrey", "grey", "lightgrey"]);
    }
}


let parts = []
export const init = function(){
        parts = [...PoissonDiscSampler(inner.width,inner.height,10,context)].sort((a,b)=>a.add[2]-b.add[2])
        draw();
}


const draw = function(){
    svg.selectAll("*").remove()

    svg.selectAll(".stem")
    .data(parts)
    .join(
      enter=>
      enter
      .append("path")
      .attr("class","stem")
      .classed("inside",d=>d.inside)
      .attr("stroke",()=>stem(Math.random()))
      .attr("stroke-width",d=>(Math.random()*2+1+(d.inside?2:0))|0)
      .attr("d",d=>`M${d.parent[0]},${d.parent[1]}L${d.parent[0]},${d.parent[1]}`)
      .call(enter=>enter
        .transition()
        .delay(d=>d.add[2]*100)
        .duration(200)
        .attr("d",d=>`M${d.add[0]},${d.add[1]}L${d.parent[0]},${d.parent[1]}`)
        .attr("stroke-linecap","round")
      )
    )

    svg.selectAll(".flower")
    .data(
      parts
      .filter(part=>part.inside||Math.random()<0.01)
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
        .attr("stroke", ()=>petal(Math.random()))
        .attr("fill", ()=>sepal(Math.random()))
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
        .attr("stroke", ()=>stamen(Math.random()))
        .attr("fill", ()=>carpal(Math.random()))
        .call(enter=>enter
          .transition()
          .delay(d=>d.add[2]*100+200)
          .attr("r",2)
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