chrome.runtime.onMessage.addListener(function(request, sender) {
  if (request.action == 'getSource') {
    var r;
    console.log(request);
    links = findVimeoLinks(request.source);
    console.log(links);
    if (!links) {
      mainPopup.innerHTML = '<h1>No vimeo links found in page.</h1>';
    } else {
      // wait for all promises to resolve and continue even on rejected
      Promise.all(links.map(getVimeoResponse).map(function(p) {return p.catch(function(e) {console.log(e)})}))
        .then(function(results) {
          console.log(results);
          var promises = [];
          for (var i = 0; i < results.length; i++) {
            if (results[i]) {
              console.log(results[i]);
              results[i]['links'] = getDownloadLinks(results[i]);
              promises.push(results[i]['links']);
            } else {
              console.log('skipped item number ' + i);
            }
          }
          r = results.filter(function(x) { return x !== undefined });
          console.log(r);
          console.log(promises);
          return Promise.all(promises.map(getContentLength));
        })
        .then(function(contentLengths) {
          console.log(contentLengths);
          for (var i = 0; i < r.length; i++) {
            r[i]['contentLengths'] = contentLengths[i].map(function(v) {
              return parseInt(v / 1024 / 1024) + 'MB';
            });
          }
          console.log(constructHtml(r));
          mainPopup.innerHTML = constructHtml(r);
        })
        .catch(function(err) {
          console.error(err);
        });
    }
  }
});

function findVimeoLinks(html) {
  var re = /\/\/(player\.)?vimeo\.com\/(video\/)?\d+/g;
  var matches = html.match(re);
  if (matches) {
    return matches
            .map(function(url) { return url.split('/').slice(-1)[0] })
            .filter(function(v,i,a) { return a.indexOf(v) === i });
  } else {
    return []
  }
}

function constructHtml(structure) {
  var html = '';
  console.log(structure);
  for (var i = 0; i < structure.length; i++) {
    html += '<h3>' + structure[i].url + '</h3>'
    for (var j = 0; j < structure[i].links.length; j++) {
      html += '<a href="' + structure[i].links[j] + '">' + structure[i].contentLengths[j] + '</a>'
    }
    html += '<br>'
  }
  if (html === '') {
    html = '<h1>No vimeo links found in page.</h1>'
  }
  return html;
}

function getDownloadLinks(obj) {
  var re = /"https(.*?)"/g,
      html = obj.html;
  return html.match(re).filter(function(m) {
    return ~m.indexOf('token');
  }).map(function(m) {
    return m.replace(/\"/g, '');
  });
}

function getContentLength(urls) {
  var promises = []
  for (var i = 0; i < urls.length; i++) {
    var promise = new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest;
      xhr.open('HEAD', urls[i]);
      xhr.onload = function (e) {
        if (this.status >= 200 && this.status < 300) {
          resolve(xhr.getResponseHeader('content-length'));
        } else {
          reject({
            status: this.status,
            statusText: xhr.statusText
          });
        }
      };
      xhr.onerror = function (e) {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      };
      xhr.send();
    });
    promises.push(promise);
  }
  return Promise.all(promises);
}

function getVimeoResponse(vimeo_id) {
  return new Promise(function(resolve, reject) {
    var fullUrl = 'https://player.vimeo.com/video/' + vimeo_id,
        xhr = new XMLHttpRequest;
    console.log('https://cors-anywhere.herokuapp.com/' + fullUrl);
    // this fixes CORS errors
    xhr.open('GET', 'https://cors-anywhere.herokuapp.com/' + fullUrl, true);
    xhr.setRequestHeader('x-requested-with', 'https://vimeo.com');
    // this avoids preflight
    xhr.setRequestHeader('content-type', 'text/plain');
    xhr.onload = function (e) {
      if (this.status >= 200 && this.status < 300) {
        resolve({
          url: fullUrl,
          html: xhr.responseText
        })
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function (e) {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };
    xhr.send();
  });
}

function onWindowLoad() {
  var mainPopup = document.querySelector('#mainPopup');

  chrome.tabs.executeScript(null, {
    file: 'src/getPageSource.js'
  }, function() {
    // If you try and inject into an extensions page or the webstore/NTP you'll get an error
    if (chrome.runtime.lastError) {
      mainPopup.innerText = 'There was an error injecting script : \n' + chrome.runtime.lastError.message;
    }
  });
}

window.onload = onWindowLoad;
