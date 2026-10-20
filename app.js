
import { firebaseConfig } from './config.js';

import {
  initializeApp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';

import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

import {
  getStorage,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const $ = id => document.getElementById(id);

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

let auth, db, storage, user;
let confirmation = null;
let unsubs = [];
let chatUnsub = null;
let bookings = [];

const fee = kind => kind === 'online' ? 2000 : 1000;

function msg(text, error = false) {
  $('message').innerHTML =
    '<div class="notice ' + (error ? '' : 'success') + '">' +
    esc(text) + '</div>';
  window.scrollTo(0, 0);
}

function clearListeners() {
  unsubs.forEach(stop => stop());
  unsubs = [];

  if (chatUnsub) chatUnsub();
  chatUnsub = null;
}

function view(id) {
  [
    'home', 'book', 'appointments', 'history',
    'payments', 'chat', 'hospital', 'profile'
  ].forEach(section => {
    const el = $(section);
    if (el) el.classList.toggle('hide', section !== id);
  });
  window.scrollTo(0, 0);
}

function portal(role) {
  $('clientLogin').classList.toggle('hide', role !== 'client');
  $('adminLogin').classList.toggle('hide', role !== 'admin');
  $('otpForm').classList.add('hide');
}

function showClient(name, phone) {
  $('login').classList.add('hide');
  $('clientApp').classList.remove('hide');
  $('adminApp').classList.add('hide');
  $('welcome').textContent = name || 'Client';
  $('profileText').textContent = (name || 'Client') + ' · ' + phone;
  view('home');
}

function bookingHTML(booking, isClient) {
  let html = '<div class="item"><b>' +
    esc(booking.kind === 'online'
      ? 'WhatsApp Voice Consultation'
      : 'Hospital Consultation') +
    '</b> <span class="pill">' + esc(booking.status) +
    '</span><p>' + esc(booking.clientName) +
    ' · PKR ' + fee(booking.kind).toLocaleString() + '</p>';

  if (booking.date) {
    html += '<p>Appointment: ' + esc(booking.date) +
      ' · ' + esc(booking.time) + ' Pakistan time</p>';
  }

  if (booking.status === 'pending') {
    html += '<p>Awaiting appointment scheduling.</p>';
  }

  if (booking.status === 'awaiting_payment' && isClient) {
    html += '<p>Payment is due after scheduling.</p>' +
      '<button class="primary" data-action="payment" data-id="' +
      esc(booking.id) + '">Submit Payment Receipt</button>';
  }

  if (booking.status === 'payment_review') {
    html += '<p>Payment receipt submitted. Awaiting verification.</p>';
  }

  if (booking.status === 'confirmed' &&
      booking.paymentStatus === 'verified') {
    html += '<p class="pill">Payment verified · Booking confirmed</p>';

    if (booking.kind === 'online') {
      html += '<p><a href="https://wa.me/923161454152" ' +
        'target="_blank" rel="noopener">Open WhatsApp contact</a></p>';
    } else {
      html += '<p>Arshad General Hospital, near Discount Mart, ' +
        'Bijligar Road, Mardan, Pakistan.</p>';
    }
  }

  if (!isClient) {
    html += '<p>Client contact: ' + esc(booking.clientPhone) + '</p>';

    if (booking.status === 'pending') {
      html += '<button class="primary" data-action="schedule" data-id="' +
        esc(booking.id) + '">Assign Date & Time</button> ' +
        '<button class="alt" data-action="reject" data-id="' +
        esc(booking.id) + '">Reject</button>';
    }

    if (booking.status === 'payment_review') {
      html += '<p>Method: ' + esc(booking.paymentMethod) +
        ' · Reference: ' + esc(booking.paymentReference) + '</p>' +
        '<button class="primary" data-action="verify" data-id="' +
        esc(booking.id) + '">Verify Actual Payment</button>';
    }
  }

  return html + '</div>';
}

function renderClient() {
  $('clientBookings').innerHTML = bookings.length
    ? bookings.map(b => bookingHTML(b, true)).join('')
    : '<p>No booking requests yet.</p>';

  $('paymentBookings').innerHTML = bookings
    .filter(b => [
      'awaiting_payment', 'payment_review', 'confirmed'
    ].includes(b.status))
    .map(b => bookingHTML(b, true)).join('') ||
    '<p>No payment requests yet.</p>';
}

function listenClient() {
  const stop = onSnapshot(
    query(collection(db, 'bookings'),
      where('ownerUid', '==', user.uid)),
    snapshot => {
      bookings = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).sort((a, b) =>
        (b.createdAt?.seconds || 0) -
        (a.createdAt?.seconds || 0)
      );
      renderClient();
    },
    error => msg(error.message, true)
  );

  unsubs.push(stop);
  listenChat(user.uid, 'clientChat');
}

function listenAdmin() {
  const stop = onSnapshot(
    collection(db, 'bookings'),
    snapshot => {
      bookings = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).sort((a, b) =>
        (b.createdAt?.seconds || 0) -
        (a.createdAt?.seconds || 0)
      );

      $('pendingCount').textContent =
        bookings.filter(b => b.status === 'pending').length;

      $('scheduledCount').textContent =
        bookings.filter(b => b.status === 'awaiting_payment').length;

      $('verifyCount').textContent =
        bookings.filter(b => b.status === 'payment_review').length;

      $('totalCount').textContent = bookings.length;

      $('adminBookings').innerHTML = bookings.length
        ? bookings.map(b => bookingHTML(b, false)).join('')
        : '<p>No bookings yet.</p>';

      const clients = [...new Set(bookings.map(b => b.ownerUid))];

      $('chatClient').innerHTML = clients.map(uid => {
        const booking = bookings.find(b => b.ownerUid === uid);
        return '<option value="' + esc(uid) + '">' +
          esc(booking?.clientName || 'Client') + '</option>';
      }).join('');

      if (clients.length) selectAdminChat();
      else {
        if (chatUnsub) chatUnsub();
        chatUnsub = null;
        $('adminChat').innerHTML = '<p>No clients available yet.</p>';
      }
    },
    error => msg(error.message, true)
  );

  unsubs.push(stop);
}

function listenChat(uid, target) {
  if (chatUnsub) chatUnsub();

  if (!uid) {
    $(target).innerHTML = '<p>No client selected.</p>';
    return;
  }

  chatUnsub = onSnapshot(
    query(
      collection(db, 'chats', uid, 'messages'),
      orderBy('createdAt', 'asc')
    ),
    snapshot => {
      $(target).innerHTML = snapshot.docs.map(d => {
        const data = d.data();
        return '<div class="item"><b>' +
          esc(data.senderRole === 'admin' ? 'Clinic' : 'Client') +
          '</b><p>' + esc(data.text) + '</p></div>';
      }).join('') || '<p class="muted">No messages yet.</p>';
    },
    error => msg(error.message, true)
  );
}

function selectAdminChat() {
  const uid = $('chatClient').value;
  if (uid) listenChat(uid, 'adminChat');
}

async function changeBooking(id, fields) {
  try {
    await updateDoc(doc(db, 'bookings', id), {
      ...fields,
      updatedAt: serverTimestamp()
    });
    msg('Appointment updated.');
  } catch (error) {
    msg(error.message, true);
  }
}

async function submitPayment(id) {
  const booking = bookings.find(b => b.id === id);
  if (!booking || booking.status !== 'awaiting_payment') return;

  const method = prompt(
    'Payment method: type Easypaisa or Meezan Bank\n\n' +
    'Easypaisa: 03161454152\n' +
    'Meezan Bank: Samavia\n' +
    'Amount: PKR ' + fee(booking.kind)
  );

  if (!['Easypaisa', 'Meezan Bank'].includes(method)) return;

  const reference = prompt('Enter your transaction reference number');
  if (!reference?.trim()) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,application/pdf';

  input.onchange = async () => {
    try {
      const file = input.files?.[0];
      if (!file) throw Error('Please select a receipt.');
      if (file.size > 5 * 1024 * 1024) {
        throw Error('Maximum receipt size is 5 MB.');
      }

      if (![
        'image/png', 'image/jpeg', 'application/pdf'
      ].includes(file.type)) {
        throw Error('Use JPG, PNG or PDF.');
      }

      const path = 'receipts/' + user.uid + '/' + id + '/' +
        Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

      await uploadBytes(ref(storage, path), file, {
        contentType: file.type
      });

      await updateDoc(doc(db, 'bookings', id), {
        paymentMethod: method,
        paymentReference: reference.trim(),
        receiptPath: path,
        paymentStatus: 'submitted',
        status: 'payment_review',
        updatedAt: serverTimestamp()
      });

      msg('Receipt submitted. The clinic must verify the actual payment.');
    } catch (error) {
      msg(error.message, true);
    }
  };

  input.click();
}

async function sendChat(uid, role, text) {
  if (!uid || !text.trim()) return;

  try {
    await addDoc(collection(db, 'chats', uid, 'messages'), {
      senderUid: user.uid,
      senderRole: role,
      text: text.trim(),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    msg(error.message, true);
  }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.role) portal(button.dataset.role);

  if (button.dataset.view) view(button.dataset.view);

  if (button.dataset.action === 'logout') {
    await signOut(auth);
  }

  if (button.dataset.action === 'schedule') {
    const date = prompt('Appointment date (YYYY-MM-DD)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;

    const time = prompt('Appointment time (HH:MM, Pakistan time)');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return;

    await changeBooking(button.dataset.id, {
      status: 'awaiting_payment',
      date,
      time
    });
  }

  if (button.dataset.action === 'reject') {
    await changeBooking(button.dataset.id, { status: 'rejected' });
  }

  if (button.dataset.action === 'verify') {
    if (confirm('Have you checked that the money was actually received?')) {
      await changeBooking(button.dataset.id, {
        status: 'confirmed',
        paymentStatus: 'verified'
      });
    }
  }

  if (button.dataset.action === 'payment') {
    await submitPayment(button.dataset.id);
  }
});

$('clientLogin').onsubmit = async event => {
  event.preventDefault();

  try {
    const name = $('fullName').value.trim();
    const phone = $('phone').value.replace(/[\s()-]/g, '');

    if (name.length < 2 || !/^\+92\d{10}$/.test(phone)) {
      throw Error('Enter your full name and a valid +92 mobile number.');
    }

    sessionStorage.setItem('pendingClientName', name);

    if (!window.recaptcha) {
      window.recaptcha = new RecaptchaVerifier(auth, 'recaptcha', {
        size: 'normal'
      });
    }

    confirmation = await signInWithPhoneNumber(
      auth, phone, window.recaptcha
    );

    $('otpForm').classList.remove('hide');
    msg('SMS sent. Enter your verification code.');
  } catch (error) {
    msg(error.message, true);
  }
};

$('otpForm').onsubmit = async event => {
  event.preventDefault();

  try {
    if (!confirmation) throw Error('Please request an OTP first.');

    const result = await confirmation.confirm($('otp').value.trim());
    const name = sessionStorage.getItem('pendingClientName');

    if (name) await updateProfile(result.user, { displayName: name });

    await setDoc(doc(db, 'profiles', result.user.uid), {
      name,
      phone: result.user.phoneNumber,
      updatedAt: serverTimestamp()
    }, { merge: true });

    msg('Mobile number verified.');
  } catch (error) {
    msg(error.message, true);
  }
};

$('adminLogin').onsubmit = async event => {
  event.preventDefault();

  try {
    const result = await signInWithEmailAndPassword(
      auth,
      $('adminEmail').value.trim(),
      $('adminPassword').value
    );

    const token = await result.user.getIdTokenResult(true);

    if (token.claims.admin !== true) {
      await signOut(auth);
      throw Error(
        'This account does not yet have secure admin permission.'
      );
    }
  } catch (error) {
    msg(error.message, true);
  }
};

$('bookingForm').onsubmit = async event => {
  event.preventDefault();

  try {
    if (!user || !user.phoneNumber) {
      throw Error('Please verify your mobile number first.');
    }

    const kind = $('kind').value;

    await addDoc(collection(db, 'bookings'), {
      ownerUid: user.uid,
      clientName: user.displayName || 'Client',
      clientPhone: user.phoneNumber,
      kind,
      fee: fee(kind),
      reason: $('reason').value.trim(),
      status: 'pending',
      paymentStatus: 'unpaid',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $('reason').value = '';
    view('appointments');
    msg('Booking request submitted.');
  } catch (error) {
    msg(error.message, true);
  }
};

$('chatClient').onchange = selectAdminChat;

$('clientChatForm').onsubmit = async event => {
  event.preventDefault();
  if (!user) return;

  await sendChat(user.uid, 'client', $('clientChatText').value);
  $('clientChatText').value = '';
};

$('adminChatForm').onsubmit = async event => {
  event.preventDefault();

  const uid = $('chatClient').value;
  if (!uid) {
    msg('Select a client first.', true);
    return;
  }

  await sendChat(uid, 'admin', $('adminChatText').value);
  $('adminChatText').value = '';
};

if (!firebaseConfig || !firebaseConfig.apiKey ||
    firebaseConfig.apiKey === 'REPLACE_ME') {
  $('setup').classList.remove('hide');
  $('login').querySelectorAll('button, input').forEach(element => {
    element.disabled = true;
  });
} else {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    onAuthStateChanged(auth, async currentUser => {
      clearListeners();
      user = currentUser;

      $('login').classList.toggle('hide', !!currentUser);
      $('clientApp').classList.add('hide');
      $('adminApp').classList.add('hide');

      if (!currentUser) return;

      try {
        const token = await currentUser.getIdTokenResult(true);

        if (token.claims.admin === true) {
          $('adminApp').classList.remove('hide');
          listenAdmin();
        } else if (currentUser.phoneNumber) {
          showClient(
            currentUser.displayName || 'Client',
            currentUser.phoneNumber
          );
          listenClient();
        } else {
          await signOut(auth);
          msg('This account is not set up as a client or admin.', true);
        }
      } catch (error) {
        msg(error.message, true);
        await signOut(auth);
      }
    });
  } catch (error) {
    msg('Firebase setup error: ' + error.message, true);
  }
}
