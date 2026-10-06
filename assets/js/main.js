// 3Dfactory — small site-wide behaviours (no dependencies)
(function () {
  // Mobile navigation
  var toggle = document.querySelector('.nav-toggle');
  var mobileNav = document.getElementById('mobile-nav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () {
      var open = mobileNav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Product category filter chips
  var chips = document.querySelectorAll('.filter-bar .chip');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var cat = chip.getAttribute('data-filter');
      chips.forEach(function (c) { c.classList.toggle('active', c === chip); });
      document.querySelectorAll('.product-grid [data-cats]').forEach(function (card) {
        var show = cat === 'all' || card.getAttribute('data-cats').split('|').indexOf(cat) !== -1;
        card.hidden = !show;
      });
    });
  });

  // Product gallery thumbnails
  var main = document.querySelector('.gallery-main img');
  document.querySelectorAll('.gallery-thumbs button').forEach(function (btn, _, all) {
    btn.addEventListener('click', function () {
      main.src = btn.getAttribute('data-src');
      all.forEach(function (b) { b.classList.toggle('active', b === btn); });
    });
  });

  // Request-a-quote form: no server, so hand the details to WhatsApp or email
  var form = document.getElementById('rfq-form');
  if (form) {
    var buildText = function () {
      var d = new FormData(form);
      return 'Request a Quote\n' +
        'Name: ' + d.get('name') + '\n' +
        'Email: ' + d.get('email') + '\n' +
        'Contact Number: ' + d.get('phone') + '\n' +
        'Budget: ' + (d.get('budget') || '-') + '\n' +
        'Project: ' + d.get('description');
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var wa = form.getAttribute('data-whatsapp');
      window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(buildText()), '_blank', 'noopener');
      document.getElementById('rfq-msg').textContent = 'Thanks for contacting us! WhatsApp has opened with your details. Just press send.';
    });
    var emailBtn = document.getElementById('rfq-email');
    emailBtn.addEventListener('click', function () {
      if (!form.reportValidity()) return;
      var to = form.getAttribute('data-email');
      window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Request a Quote') + '&body=' + encodeURIComponent(buildText());
    });
  }
})();
