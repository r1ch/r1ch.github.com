var fApp = angular.module('fApp', []);
fApp.controller('faffController', function($scope) {

$scope.kept=[];

$scope.update = function(index,answer){
    $scope.interview = $scope.interview.slice(0,index+1)
    $scope.interview.push(questions[answer.next])
}



questions = [];
questions["start"]={
  title:"What is your name?",
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
      next: "bindings"
    },{
      title: "Waiting at the top of a chairlift",
      next: "bindings"
    },{
      title: "On a chairlift",
      next: "planning"
    },{
      title: "Weeing",
      next: "couldyou"
    },{
      title: "Fiddling with my boots",
      next: "couldyou"
    },{
      title: "In the chalet",
      next: "readyfornext"
    }
  ]
}

questions["bindings"]={
  title:"Do you need a wee / to do up your boots / piss about with your binding?",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "now"
    },
    {
      title: "No",
      next: "planning"
    }
  ]
}

questions["now"]={
  title:"Could you do that now?",
  handler:"radio",
  answers:[
    {
      title: "I could but...",
      next: "nonparallelfaff"
    },
    {
      title: "No",
      next: "notfaff"
    },
    {
      title: "Yes",
      next: "andyouregoingto"
    }
  ]
}

questions["andyouregoingto"]={
  title:"And you're going to?",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "faffavoidance"
    },
    {
      title: "No",
      next: "faff"
    }
  ]
}

questions["couldyou"]={
  title:"Could you have done it earlier?",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "faff"
    },
    {
      title: "No",
      next: "essential"
    }
  ]
}

questions["essential"]={
  title:"Is it utterly essential?",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "sure"
    },
    {
      title: "No",
      next: "youknow"
    }
  ]
}

questions["sure"]={
  title:"Are you sure?",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "planned"
    },
    {
      title: "No",
      next: "faff"
    }
  ]
}

questions["planned"]={
  title:"Did you plan this to reduce faff?",
  handler:"radio",
  answers:[
    {
      title: "No",
      next: "faff"
    },
    {
      title: "Yes",
      next: "notfaff"
    }
  ]
}


questions["planning"]={
  title:"Are you planning the next run?",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "notfaff"
    },
    {
      title: "No",
      next: "noteam"
    }
  ]
}


questions["readyfornext"]={
  title:"Are you ready for the next activity?",
  handler:"radio",
  answers:[
    {
      title: "Yes",
      next: "notfaff"
    },
    {
      title: "No",
      next: "potential"
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
questions["youknow"]={
  end:true,
  type:"danger",
  title:"You're faffing",
  reason:"You know what you did"
}
questions["noteam"]={
  end:true,
  type:"danger",
  title:"You're faffing",
  reason:"You're just not a team player."
}
questions["faff"]={
  end:true,
  type:"danger",
  title:"You're faffing",
  reason:"Classic faff."
}
questions["potential"]={
  end:true,
  type:"warning",
  title:"Erm...",
  reason:"Just watch it right?"
}

$scope.interview = []
$scope.interview[0] = questions["start"]

});

fApp.directive('question', function() {
  return {
    templateUrl: 'question.html'
  };
});
