(function () {

    $(document).ready(function () {


        window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;



        if (window.File && window.FileReader && window.FileList && window.Blob) {

            if (isInputDirSupported()) {

                $("#dragdroptext").append("Drag and drop folders here to upload them");
                $(".newBundleNameCell").remove();
                $("#btnAddBundle").text("Add selected folders as bundles");
            }
            else {

                $("#dragdroptext").append("Drag and drop files here to create a bundle. If you want to upload multiple bundles at the same time, do so using the WPF Uploader. You can download the WPF uploader from <a href='#'>here</a>: ");
                $("#btnAddBundle").text("Add selected files a a bundle");
            }

        } else {
            $("#dragdroptext").append("This browser does not support dragging and dropping of files. Please use the WPF Uploader to upload your assets. You can download the WPF Uploader <a href='#'>here</a>");
            $(".uploader").remove();
        }

        var FileDragHover = function (e) {
            e.stopPropagation();
            e.preventDefault();

            $("#dragdroppanel").parent().removeClass("panel-info");
            $("#dragdroppanel").parent().addClass("panel-danger");
        };

        var FileDragLeave = function (e) {
            e.stopPropagation();
            e.preventDefault();

            $("#dragdroppanel").parent().removeClass("panel-danger");
            $("#dragdroppanel").parent().addClass("panel-info");
        };

        var FileSelectHandler = function (e) {
            console.log("Entered ondrop");
            e.stopPropagation();
            e.preventDefault();

            $("#dragdroppanel").parent().removeClass("panel-danger");
            $("#dragdroppanel").parent().addClass("panel-info");

            // fetch FileList object
            var files = e.target.files || e.dataTransfer.files;

            if (isInputDirSupported()) {

                var items = e.dataTransfer.items;
                var files = e.dataTransfer.files;

                for (var i = 0, item; item = items[i]; ++i) {
                    // Skip this one if we didn't get a file.
                    if (item.kind != 'file') {
                        continue;
                    }

                    var entry = item.webkitGetAsEntry();
                    if (entry.isDirectory) {
                        console.log("Adding bundle row");
                        AddBundleRow(cleanStringForUseInId(entry.name));

                        readDirectoryContents(entry);

                    } else {
                        if (entry.isFile) {
                            console.log("Entry is a file:" + entry.fullPath + ". Not supported.");
                        } else {
                            console.log("Unknown type");
                        }
                    }
                }
            }

            else {

                AddBundleRow("newbundle");
                // process all File objects
                for (var i = 0, f; f = files[i]; i++) {
                    UploadFile(f, "newbundle");
                }
            }
        };

        var filedrag = document.getElementById("dragdroppanel");
        filedrag.addEventListener("dragover", FileDragHover, false);
        filedrag.addEventListener("dragleave", FileDragLeave, false);
        filedrag.addEventListener("drop", FileSelectHandler, false);
    });

    function readDirectoryContents(dirEntry) {

        readDirectory(dirEntry, function (entries) {
            // Handle no files case.
            if (!entries.length) {
                console.log('Add some files chief!');
                return;
            }

            entries.forEach(function (entry, i) {

                if (entry.isDirectory) {
                    console.log("ignoring sub directories");

                } else {
                    var callback = function (entry) {
                        return function (f) {

                            console.log("Add asset row");
                            var progressBarElement = addRowForAsset(f.name, cleanStringForUseInId((entry.fullPath.split('/')[1])));
                            UploadFile(f, cleanStringForUseInId((entry.fullPath.split('/')[1])), progressBarElement);
                        };
                    };
                    entry.file(callback(entry), onError);
                }
            });
        });
    }

    function readDirectory(dirEntry, callback) {
        var dirReader = dirEntry.createReader();
        var entries = [];

        // Call the reader.readEntries() until no more results are returned.
        var readEntries = function () {
            dirReader.readEntries(function (results) {
                if (!results.length) {
                    callback(entries);
                } else {
                    entries = entries.concat(toArray(results));
                    readEntries();
                }
            }, onError);
        };

        readEntries(); // Start reading dirs.
    }

    function toArray(list) {
        return Array.prototype.slice.call(list || [], 0);
    }

    function onError(e) {
        console.log('Error message: ' + e.message);
    }

    function AddBundleRow(bundleName) {

        var listGroupItem = $("<div/>", {
            class: "list-group-item",

        });

        listGroupItem.append("<b>" + bundleName + "</b>");

        var listGroup = $("<div/>", {
            class: "list-group",
            id: bundleName

        });

        listGroup.append(listGroupItem);

        $("#dragdroppanel").prepend(listGroup);
    }

    function UploadFile(file, bundleName, progressElement) {

        var running = false;
        var statusDiv = document.getElementById('status');
        var button = document.getElementById('toggleWorker');
        var uploadWorker = new Worker("Scripts/UploadWorker.js");
        uploadWorker.addEventListener('message', function (event) {

            handleMessagesFromWebWorker(event.data, progressElement);
        });

        var data = {};
        data.file = file;
        data.sasUri = "//" + window.location.host + "/Scripts/GetSaS.txt";
        data.sasServiceParams = '{ "workspaceId": \"52F6F14D-6BDE-4890-BD8F-2BE076BEACDA\" }';
        uploadWorker.postMessage(data);
    }


    function handleMessagesFromWebWorker(data, progressElement) {

        switch (data.MessageType) {

            case "Done": {
                progressElement.css("width", "100%");
                $(progressElement.parent().children()[0]).text("File Uploaded Successfully.");
                $(progressElement.parent()[0]).removeClass("active");
                $(progressElement.parent()[0]).removeClass("progress-striped");
                $(progressElement).removeClass("progress-bar-info");
                $(progressElement).addClass("progress-bar-success");
                console.log(data.FileName);
                break;
            }

            case "Progress": {
                progressElement.css("width", data.Progress + "%");
                $(progressElement.parent().children()[0]).text(data.Progress + "%");
                break;
            }

            case "Status": {
                $(progressElement.parent().children()[0]).text(data.Status);
                break;
            }

            case "Error": {
                $(progressElement.parent().children()[0]).text(data.ErrorMessage);
                $(progressElement.parent()[0]).removeClass("active");
                $(progressElement.parent()[0]).removeClass("progress-striped");
                $(progressElement).removeClass("progress-bar-info");
                $(progressElement).addClass("progress-bar-danger");
                progressElement.css("width", "100%");
                break;
            }
        }
    }

    function readableFileSize(size) {
        var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        var i = 0;
        while (size >= 1024) {
            size /= 1024;
            ++i;
        }
        return size.toFixed(1) + ' ' + units[i];
    }

    var addRowForAsset = function (text, bundleName) {

        var progressBarElement = $("<div/>", {
            class: "progress-bar progress-bar-info",
            style: "width: 0%"
        });

        var progressBarContainer = $("<div/>", {

            class: "progress progress-striped active"
        });

        progressBarContainer.append(progressBarElement);

        var listGroupItem = $("<div/>", {
            class: "list-group-item",

        });

        listGroupItem.append(text);
        listGroupItem.append(progressBarContainer);

        var listGroup = $("#" + bundleName);

        listGroup.append(listGroupItem);
        return progressBarElement;
    }

    function isInputDirSupported() {
        var tmpInput = document.createElement('input');
        if ('webkitdirectory' in tmpInput
            || 'mozdirectory' in tmpInput
            || 'odirectory' in tmpInput
            || 'msdirectory' in tmpInput
            || 'directory' in tmpInput) return true;

        return false;
    }

    function cleanStringForUseInId(inputString) {
        var regexp = new RegExp("[^A-Za-z-_0-9]", "g");
        return inputString.replace(regexp, "");

    }

})();