var fApp = angular.module('fApp', []);
fApp.controller('faffController', function($scope) {

$scope.kept=[];

$scope.update = function(index,answer){
  console.log("got index " + index + " "  +JSON.stringify(answer))
    $scope.interview = $scope.interview.slice(0,index+1)
    console.log($scope.interview.length)
    $scope.interview.push(questions[answer.next])
}


questions = [];
questions["start"]={
  title:"What is your name",
  handler:"radio",
  answers:[
    {
      title: "James Dracup",
      next: "james"
    },{
      title: "It's not James Dracup",
      next: "doing"
    }
  ]
}

questions["doing"]={
  title:"What are you doing?",
  handler:"select",
  answers:[
    {
      title: "Skiing",
      next: "notfaff"
    },{
      title: "Waiting at the bottom of a chairlift",
      next: "anydanger"
    },{
      title: "Waiting at the top of a chairlift",
      next: "anydanger"
    },{
      title: "On a chairlift",
      next: "notfaff"
    },{
      title: "Weeing",
      next: "didyou"
    },{
      title: "Fiddling with my boots",
      next: "didyou"
    }
  ]
}

questions["didyou"]={
  title:"Could you have done this earlier?",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "youknow"
    },
    {
      title: "No",
      next: "notfaff"
    }
  ]
}

questions["anydanger"]={
  title:"Do you need a wee / to do up your boots / piss about with binding",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "faffdanger"
    },
    {
      title: "No",
      next: "notfaff"
    }
  ]
}

questions["faffdanger"]={
  title:"Could you do that now?",
  handler:"radio",
  answers:[
    {
      title: "No - not enough time",
      next: "notfaff"
    },
    {
      title: "I could but...",
      next: "nonparallelfaff"
    },
    {
      title: "Yes",
      next: "faffavoidance"
    }
  ]
}


//ends
questions["james"]={
  end:true,
  type:"danger",
  title:"You're faffing",
  reason:"You are Lord of all faff"
}
questions["faffavoidance"]={
  end:true,
  type:"success",
  title:"You're avoiding faff",
  reason:"This is the true path to enlightenment"
}
questions["nonparallelfaff"]={
  end:true,
  type:"danger",
  title:"You are faffing",
  reason:"Faff costs lives"
}
questions["notfaff"]={
  end:true,
  type:"success",
  title:"That's not faff!",
  reason:"Great work."
}
questions["james"]={
  end:true,
  type:"danger",
  title:"You're faffing",
  reason:"You are Lord of all faff"
}
questions["youknow"]={
  end:true,
  type:"danger",
  title:"You're faffing",
  reason:"You know what you did"
}
$scope.interview = []
$scope.interview[0] = questions["start"]

});

fApp.directive('question', function() {
  return {
    templateUrl: 'question.html'
  };
});
