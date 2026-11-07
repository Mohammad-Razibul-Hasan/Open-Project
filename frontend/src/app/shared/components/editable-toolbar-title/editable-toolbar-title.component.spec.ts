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

import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { OpIconComponent } from 'core-app/shared/components/icon/icon.component';
import { OpTooltipDirective } from 'core-app/shared/components/primer/tooltip.directive';
import { AutofocusDirective } from 'core-app/shared/directives/focus/autofocus.directive';
import { EditableToolbarTitleComponent, triggerEditingEvent } from './editable-toolbar-title.component';

describe('EditableToolbarTitleComponent', () => {
  async function render() {
    TestBed.configureTestingModule({
      declarations: [EditableToolbarTitleComponent, AutofocusDirective, OpIconComponent],
      imports: [CommonModule, FormsModule, OpTooltipDirective],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
    const fixture = TestBed.createComponent(EditableToolbarTitleComponent);
    fixture.componentRef.setInput('title', 'Original title');
    await fixture.whenStable();
    return fixture;
  }

  it('restores the title on Escape and emits the trimmed title on Enter', async () => {
    const fixture = await render();
    const save = vi.fn<(title:string) => void>();
    fixture.componentInstance.onSave.subscribe(save);
    const input = screen.getByRole('textbox');

    fireEvent.input(input, { target: { value: 'Draft' } });
    await screen.findByText('Draft');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(input).toHaveValue('Original title'));
    expect(save).not.toHaveBeenCalled();

    fireEvent.input(input, { target: { value: ' New title ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(save).toHaveBeenCalledExactlyOnceWith('New title');
    await waitFor(() => expect(input).toBeDisabled());
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('New title');
  });

  it('responds to a native edit request, then shows an updated read-only title', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const input = screen.getByRole('textbox');

    fireEvent(host, new CustomEvent(triggerEditingEvent, { detail: 'Suggested title' }));
    await waitFor(() => expect(input).toHaveValue('Suggested title'));
    await waitFor(() => expect(input).toHaveFocus());

    fixture.componentRef.setInput('editable', false);
    fixture.componentRef.setInput('title', 'Read-only title');
    expect(await screen.findByText('Read-only title')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
