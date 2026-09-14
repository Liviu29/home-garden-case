import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmService } from './confirm-dialog';

/**
 * The confirmation seam (UX standard: destructive actions always confirm).
 * What matters is the CONTRACT callers rely on — a boolean that is only ever
 * `true` when the user actually confirmed. A dialog dismissed by Escape, by a
 * backdrop click or by Cancel must all read as "no".
 */
describe('ConfirmService', () => {
  let service: ConfirmService;

  const setup = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    service = TestBed.inject(ConfirmService);
  };

  beforeEach(setup);
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('renders the supplied title, message and confirm label', async () => {
    const pending = service.confirm({
      title: 'Delete garden?',
      message: 'This removes the garden and every plant in it.',
      confirmLabel: 'Delete garden',
      destructive: true,
    });
    TestBed.tick();

    const dialog = document.querySelector('mat-dialog-container') ?? document.body;
    expect(dialog.textContent).toContain('Delete garden?');
    expect(dialog.textContent).toContain('This removes the garden and every plant in it.');
    expect(dialog.textContent).toContain('Delete garden');

    TestBed.inject(MatDialog).closeAll();
    await expect(pending).resolves.toBe(false);
  });

  it('defaults the label to "Confirm" and the tone to non-destructive', async () => {
    const pending = service.confirm({ title: 'Discard?', message: 'Unsaved changes.' });
    TestBed.tick();

    const dialog = document.querySelector('mat-dialog-container') ?? document.body;
    expect(dialog.textContent).toContain('Confirm');
    expect(dialog.querySelector('.confirm-dialog__confirm--destructive')).toBeNull();

    TestBed.inject(MatDialog).closeAll();
    await pending;
  });

  it('marks the confirm button destructive when asked', async () => {
    const pending = service.confirm({
      title: 'Delete plant?',
      message: 'Gone for good.',
      destructive: true,
    });
    TestBed.tick();

    expect(document.querySelector('.confirm-dialog__confirm--destructive')).not.toBeNull();

    TestBed.inject(MatDialog).closeAll();
    await pending;
  });

  it('resolves TRUE when the confirm button is pressed', async () => {
    const pending = service.confirm({ title: 'Sure?', message: 'Really?' });
    TestBed.tick();

    const buttons = [...document.querySelectorAll('mat-dialog-actions button')];
    const confirm = buttons.at(-1) as HTMLButtonElement;
    confirm.click();
    TestBed.tick();

    await expect(pending).resolves.toBe(true);
  });

  it('resolves FALSE when Cancel is pressed', async () => {
    const pending = service.confirm({ title: 'Sure?', message: 'Really?' });
    TestBed.tick();

    const cancel = document.querySelector('mat-dialog-actions button') as HTMLButtonElement;
    cancel.click();
    TestBed.tick();

    await expect(pending).resolves.toBe(false);
  });

  it('resolves FALSE when the dialog is dismissed without an answer', async () => {
    const pending = service.confirm({ title: 'Sure?', message: 'Really?' });
    TestBed.tick();

    TestBed.inject(MatDialog).closeAll();
    TestBed.tick();

    await expect(pending).resolves.toBe(false);
  });
});
