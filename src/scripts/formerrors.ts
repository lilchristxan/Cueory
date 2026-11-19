/**
 * Inline form errors (x2 lane 9). A plain email box gets a written message next to it instead of the browser's own
 * bubble, which some screen readers skip and which vanishes on the next click. The message is plain text that starts
 * with "problem:", so it never relies on colour, it is announced (role="alert"), and the box is marked aria-invalid and
 * points at it with aria-describedby. Without JavaScript the form is untouched and the browser's check still runs.
 * Lowercase brand voice (D-47).
 */

/** Same loose shape the browser's own email check uses: something, "@", something, no spaces. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/**
 * The message for an email box value, or null when it looks fine. `nativeMismatch` is the browser's own verdict
 * (`input.validity.typeMismatch`, still filled in with noValidate), so addresses it rejects, such as a comma or a
 * doubled dot in the domain, are still blocked with the written message. Kit still confirms the address by email.
 */
export function emailProblem(value: string, nativeMismatch = false): string | null {
  const text = value.trim();
  if (text === '') return 'problem: enter your email address.';
  if (nativeMismatch || !EMAIL_SHAPE.test(text)) {
    return 'problem: that email address needs an @ and a name on both sides, like name@example.com.';
  }
  return null;
}

/**
 * Wires one email form: checks on submit (and again as the visitor fixes it), shows the message in `message`, and
 * returns focus to the box when it blocks the send.
 */
export function attachEmailErrors(form: HTMLFormElement, input: HTMLInputElement, message: HTMLElement): void {
  const describedBy = input.getAttribute('aria-describedby');
  const show = (problem: string | null) => {
    message.textContent = problem ?? '';
    message.hidden = problem === null;
    if (problem === null) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
    const ids = [describedBy, problem === null ? null : message.id].filter(Boolean).join(' ');
    if (ids) input.setAttribute('aria-describedby', ids);
    else input.removeAttribute('aria-describedby');
  };
  form.noValidate = true;
  form.addEventListener('submit', (event) => {
    const problem = emailProblem(input.value, input.validity.typeMismatch);
    show(problem);
    if (problem !== null) {
      event.preventDefault();
      input.focus();
    }
  });
  input.addEventListener('input', () => {
    if (input.hasAttribute('aria-invalid')) show(emailProblem(input.value, input.validity.typeMismatch));
  });
}
