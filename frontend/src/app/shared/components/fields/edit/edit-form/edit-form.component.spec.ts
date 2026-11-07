//-- copyright
// OpenProject is an open source project management software.
// Copyright (C) the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// See COPYRIGHT and LICENSE files for more details.
//++

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { GlobalEditFormChangesTrackerService } from '../services/global-edit-form-changes-tracker/global-edit-form-changes-tracker.service';
import { EditFormComponent } from './edit-form.component';

@Component({
  selector: 'op-test-edit-mode',
  template: `
    <span role="status">{{ form.editMode ? 'Editing' : 'Viewing' }}</span>
    <button type="button" (click)="form.cancel()">Cancel</button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EditModeComponent {
  readonly form = inject(EditFormComponent);
}

@Component({
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
class EditFormHostComponent {}

describe('EditFormComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('publishes edit mode to projected consumers and unregisters on destroy', async () => {
    vi.stubGlobal('OpenProject', {});
    TestBed.configureTestingModule({
      declarations: [EditFormComponent, EditFormHostComponent],
      imports: [EditModeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).overrideTemplate(EditFormHostComponent, `
      <edit-form [inEditMode]="true"><op-test-edit-mode /></edit-form>
    `);
    const tracker = TestBed.inject(GlobalEditFormChangesTrackerService);
    const register = vi.spyOn(tracker, 'addToActiveForms');
    const unregister = vi.spyOn(tracker, 'removeFromActiveForms');
    const fixture = TestBed.createComponent(EditFormHostComponent);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Editing'));
    const form = register.mock.calls[0][0];

    // Edit actions outside the projected view can end the form asynchronously.
    await Promise.resolve().then(() => form.cancel());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Viewing'));

    form.editMode = true;
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Editing'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Viewing'));

    fixture.destroy();
    expect(unregister).toHaveBeenCalledExactlyOnceWith(form);
  });
});
