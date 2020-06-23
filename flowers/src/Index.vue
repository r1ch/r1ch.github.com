<template>
  <div id="app" @click = "init">
  </div>
</template>

<script>
import {mount, init} from './flowers'


export default {
  name: 'App',
  data: ()=>({
    text: location.search ? decodeURI(location.search).slice(1) || "bradish" : "bradish",
    dull:false
  }),
  mounted: function(){
    mount(this.text,this.dull)
    init()
  },
  methods:{
    init: ()=>init()
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
