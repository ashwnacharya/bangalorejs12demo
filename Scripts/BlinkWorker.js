(function () {
    "use strict";

	var row, column, frequency;
    

    addEventListener('message', function (event) {

        
        row = event.data.row;
		column = event.data.column;
		frequency = event.data.frequency;
		
		var myVar = setInterval(function(){myTimer()},frequency);

    });
	
	function myTimer() {
		postMessage({ row: row, column: column });
	}
	
	
}());