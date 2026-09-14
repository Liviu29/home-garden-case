import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmService } from './confirm-dialog';

/** The dialog opens in an overlay outside any component; a blank host gives the harnesses a document. */
@Component({ template: '' })
class Blank {}

/**
 * The confirmation seam (UX standard: destructive actions always confirm).
 * What matters is the CONTRACT callers rely on — a boolean that is only ever
 * `true` when the user actually confirmed. A dialog dismissed by Escape, by a
 * backdrop click or by Cancel must all read as "no". The dialog is driven
 * through Material's harnesses, never through its DOM.
 */
describe('ConfirmService', () => {
  let service: ConfirmService;
  let loader: HarnessLoader;

  const setup = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Blank], providers: [provideNoopAnimations()] });
    service = TestBed.inject(ConfirmService);
    loader = TestbedHarnessEnvironment.documentRootLoader(TestBed.createComponent(Blank));
  };
  const dialog = () => loader.getHarness(MatDialogHarness);
  const button = async (text: string) =>
    (await dialog()).getHarness(MatButtonHarness.with({ text }));
  const destructiveButtons = async () =>
    (await dialog()).getAllHarnesses(
      MatButtonHarness.with({ selector: '.confirm-dialog__confirm--destructive' }),
    );

  beforeEach(setup);
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('renders the supplied title, message and confirm label', async () => {
    const pending = service.confirm({
      title: 'Delete garden?',
      message: 'This removes the garden and every plant in it.',
      confirmLabel: 'Delete garden',
      destructive: true,
    });

    const open = await dialog();
    expect(await open.getTitleText()).toBe('Delete garden?');
    expect(await open.getContentText()).toContain('This removes the garden and every plant in it.');
    expect(await open.getActionsText()).toContain('Delete garden');

    TestBed.inject(MatDialog).closeAll();
    await expect(pending).resolves.toBe(false);
  });

  it('defaults the label to "Confirm" and the tone to non-destructive', async () => {
    const pending = service.confirm({ title: 'Discard?', message: 'Unsaved changes.' });

    expect(await (await dialog()).getActionsText()).toContain('Confirm');
    expect(await destructiveButtons()).toHaveLength(0);

    TestBed.inject(MatDialog).closeAll();
    await pending;
  });

  it('marks the confirm button destructive when asked', async () => {
    const pending = service.confirm({
      title: 'Delete plant?',
      message: 'Gone for good.',
      destructive: true,
    });

    const [destructive] = await destructiveButtons();
    expect(await destructive.getText()).toBe('Confirm');

    TestBed.inject(MatDialog).closeAll();
    await pending;
  });

  it('resolves TRUE when the confirm button is pressed', async () => {
    const pending = service.confirm({ title: 'Sure?', message: 'Really?' });

    await (await button('Confirm')).click();

    await expect(pending).resolves.toBe(true);
  });

  it('resolves FALSE when Cancel is pressed', async () => {
    const pending = service.confirm({ title: 'Sure?', message: 'Really?' });

    await (await button('Cancel')).click();

    await expect(pending).resolves.toBe(false);
  });

  it('resolves FALSE when the dialog is dismissed without an answer', async () => {
    const pending = service.confirm({ title: 'Sure?', message: 'Really?' });
    await dialog(); // open

    TestBed.inject(MatDialog).closeAll();

    await expect(pending).resolves.toBe(false);
  });
});
