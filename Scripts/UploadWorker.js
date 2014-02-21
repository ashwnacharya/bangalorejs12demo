(function () {
    "use strict";

    var maxBlockSize = 256 * 1024;//Each file will be split in 256 KB.
    var numberOfBlocks = 1;
    var selectedFile = null;
    var currentFilePointer = 0;
    var totalBytesRemaining = 0;
    var blockIds = new Array();
    var blockIdPrefix = "block-";
    var submitUri = null;
    var bytesUploaded = 0;
    var sasServiceUri;
    var sasServiceParams;
    var reader;
    var baseUrl = "";

    addEventListener('message', function (event) {

        SendStatusMessage("Spawned a new web worker to upload file.");

        selectedFile = event.data.file;
        sasServiceUri = event.data.sasUri;
        sasServiceParams = event.data.sasServiceParams;
        reader = new FileReader();
        reader.onloadend = readerOnLoadEnd;

        SendStatusMessage("Analysing selected file.");
        analyzeFile();
        SendStatusMessage("Processing the selected file.");
        sliceFile();
    });

    function analyzeFile() {

        maxBlockSize = 256 * 1024;
        currentFilePointer = 0;
        totalBytesRemaining = 0;

        var fileSize = selectedFile.size;

        if (fileSize < maxBlockSize) {
            maxBlockSize = fileSize;
        }

        totalBytesRemaining = fileSize;

        if (fileSize % maxBlockSize == 0) {
            numberOfBlocks = fileSize / maxBlockSize;
        } else {
            numberOfBlocks = parseInt(fileSize / maxBlockSize, 10) + 1;
        }
    }

    function readerOnLoadEnd(evt) {

        if (evt.target.readyState == FileReader.DONE) {

            if (sasUrlIsExpired()) {

                getSaSUrlThenCall(uploadChunk, evt.target.result);
            }
            else {
                uploadChunk(evt.target.result);
            }
        }
    };

    function sliceFile() {
        if (totalBytesRemaining > 0) {
           
            if (selectedFile.size == 0) {
                SendErrorMessage("The selected file does not exist any more. Please verify if the file exists");
                throw "File does not exist anymore";
            }

            var fileContent = selectedFile.slice(currentFilePointer, currentFilePointer + maxBlockSize);
            var blockId = blockIdPrefix + pad(blockIds.length, 6);
            blockIds.push(btoa(blockId));
            reader.readAsArrayBuffer(fileContent);
            currentFilePointer += maxBlockSize;
            totalBytesRemaining -= maxBlockSize;

            if (totalBytesRemaining < maxBlockSize) {
                maxBlockSize = totalBytesRemaining;
            }
        } else {

            if (sasUrlIsExpired()) {
                getSaSUrlThenCall(commitBlockList);
            }
            else {
                commitBlockList();
            }
        }
    }

    function uploadChunk(chunk) {

        var indexOfQueryStart = baseUrl.indexOf("?");
        submitUri = baseUrl.substring(0, indexOfQueryStart) + '/' + selectedFile.name + baseUrl.substring(indexOfQueryStart);
        var uri = submitUri + '&comp=block&blockid=' + blockIds[blockIds.length - 1];
        var requestData = new Uint8Array(chunk);
        var ajaxRequest = new XMLHttpRequest();

        ajaxRequest.onreadystatechange = function () {

            if (ajaxRequest.readyState == 4) {
                if (ajaxRequest.status == 201) {
                    bytesUploaded += requestData.byteLength;
                    var percentComplete = ((parseFloat(bytesUploaded) / parseFloat(selectedFile.size)) * 100).toFixed(2);
                    SendProgressMessage( percentComplete);
                    sliceFile();
                }
                else {
                    SendErrorMessage("There is something wrong with Windows Azure. Please contact your administrator.");
                }
            }
        };

        ajaxRequest.open('PUT', uri, true);
        ajaxRequest.setRequestHeader('x-ms-blob-type', selectedFile.type);
        ajaxRequest.setRequestHeader("content-type", selectedFile.type);
        ajaxRequest.setRequestHeader("Accept", "*/*");
        ajaxRequest.setRequestHeader("Content-Length", requestData.length);
        ajaxRequest.send(requestData);

    }

    function commitBlockList() {
        var indexOfQueryStart = baseUrl.indexOf("?");
        submitUri = baseUrl.substring(0, indexOfQueryStart) + '/' + selectedFile.name + baseUrl.substring(indexOfQueryStart);
        var uri = submitUri + '&comp=blocklist';
        var requestBody = '<?xml version="1.0" encoding="utf-8"?><BlockList>';
        for (var i = 0; i < blockIds.length; i++) {
            requestBody += '<Latest>' + blockIds[i] + '</Latest>';
        }
        requestBody += '</BlockList>';
        var ajaxRequest = new XMLHttpRequest();

        ajaxRequest.onreadystatechange = function () {

            if (ajaxRequest.readyState == 4) {

                if (ajaxRequest.status == 201) {
                    SendCompletionMessage();
                }
                else {
                    SendErrorMessage("There is something wrong with Windows Azure. Please contact your administrator.");
                }
            }
        };

        ajaxRequest.open('PUT', uri, true);
        ajaxRequest.setRequestHeader('x-ms-blob-content-type', selectedFile.type);
        ajaxRequest.setRequestHeader("Content-Type", selectedFile.type);
        ajaxRequest.send(requestBody);
    }

    function getSaSUrlThenCall(callback, otherData) {
        var sasServiceRequest = new XMLHttpRequest();
        sasServiceRequest.onreadystatechange = function () {

            if (sasServiceRequest.readyState == 4) {

                if (sasServiceRequest.status == 200) {

                    baseUrl = sasServiceRequest.response;
                    callback(otherData);
                }
            }
        };

        sasServiceRequest.open('GET', sasServiceUri, true);
        //sasServiceRequest.setRequestHeader("Content-type", "application/json");
        //sasServiceRequest.responseType = "json";
        sasServiceRequest.send(sasServiceParams);
    }

    function SendErrorMessage(errorMessage) {
        postMessage({ MessageType: "Error", ErrorMessage: errorMessage });
    }

    function SendProgressMessage(completion) {
        postMessage({ MessageType: "Progress", Progress: completion });
    }

    function SendStatusMessage(message) {
        postMessage({ MessageType: "Status", Status: message });
    }

    function SendCompletionMessage() {
        postMessage({ MessageType: "Done", FileName: selectedFile.name });
    }

    function sasUrlIsExpired() {

        if (baseUrl == "") {

            return true;
        }

        var queryStringPart = decodeURIComponent(baseUrl).split("?")[1];
        var startDate = Date.parse(getParameterByName(queryStringPart, "st"));

        var endDate = Date.parse(getParameterByName(queryStringPart, "se"));

        // 2 minutes buffer
        endDate = endDate - 2*60*1000;

        var currentDate = Date.now();

        if (currentDate > startDate && currentDate < endDate) {

            return false;
        }
        else {
            return true;
        }
    }

    function getParameterByName(url, name) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(url);
        return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    function pad(number, length) {
        var str = '' + number;
        while (str.length < length) {
            str = '0' + str;
        }
        return str;
    }

}());