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

import { AsyncPipe, NgClass, NgStyle, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgOptionHighlightDirective } from '@ng-select/ng-option-highlight';
import { NgSelectModule } from '@ng-select/ng-select';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { CurrentProjectService } from 'core-app/core/current-project/current-project.service';
import { I18nService } from 'core-app/core/i18n/i18n.service';
import { SchemaCacheService } from 'core-app/core/schemas/schema-cache.service';
import { States } from 'core-app/core/states/states.service';
import { SchemaResource } from 'core-app/features/hal/resources/schema-resource';
import { HalResourceService } from 'core-app/features/hal/services/hal-resource.service';
import { initializeHalResourceConfig } from 'core-app/features/hal/services/hal-resource.config';
import { WorkPackageCardDragAndDropService } from 'core-app/features/work-packages/components/wp-card-view/services/wp-card-drag-and-drop.service';
import { IsolatedQuerySpace } from 'core-app/features/work-packages/directives/query-space/isolated-query-space';
import { WorkPackageNotificationService } from 'core-app/features/work-packages/services/notifications/work-package-notification.service';
import { OpAutocompleterComponent } from 'core-app/shared/components/autocompleter/op-autocompleter/op-autocompleter.component';
import { PaginationService } from 'core-app/shared/components/table-pagination/pagination-service';
import { firstValueFrom, Subject } from 'rxjs';
import { BoardInlineAddAutocompleterComponent } from './board-inline-add-autocompleter.component';

describe('BoardInlineAddAutocompleterComponent', () => {
  it('searches and emits the selected card after its schema is available', async () => {
    const schema = new Subject<SchemaResource>();
    const handleRawError = vi.fn<WorkPackageNotificationService['handleRawError']>();
    const ensureLoaded = vi.fn<SchemaCacheService['ensureLoaded']>().mockReturnValue(firstValueFrom(schema));
    const removeReferenceWorkPackageForm = vi.fn<WorkPackageCardDragAndDropService['removeReferenceWorkPackageForm']>();

    await TestBed.configureTestingModule({
      declarations: [OpAutocompleterComponent, BoardInlineAddAutocompleterComponent],
      imports: [AsyncPipe, NgClass, NgStyle, NgTemplateOutlet, FormsModule, NgSelectModule, NgOptionHighlightDirective],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        States,
        { provide: PaginationService, useValue: {} },
        IsolatedQuerySpace,
        { provide: CurrentProjectService, useValue: { id: null } },
        { provide: I18nService, useValue: { t: (key:string) => key } },
        { provide: SchemaCacheService, useValue: { ensureLoaded } },
        { provide: WorkPackageCardDragAndDropService, useValue: { removeReferenceWorkPackageForm } },
        { provide: WorkPackageNotificationService, useValue: { handleRawError } },
      ],
    }).compileComponents();

    const hal = TestBed.inject(HalResourceService);
    initializeHalResourceConfig(hal)();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BoardInlineAddAutocompleterComponent);
    const reference = vi.fn();
    const cancel = vi.fn();
    fixture.componentInstance.onReferenced.subscribe(reference);
    fixture.componentInstance.onCancel.subscribe(cancel);
    await fixture.whenStable();

    const input = screen.getByRole('combobox');
    await waitFor(() => expect(input).toHaveFocus());
    expect(removeReferenceWorkPackageForm).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('aria-expanded', 'true');

    const autocompleter = fixture.debugElement.query(By.directive(OpAutocompleterComponent)).injector.get(OpAutocompleterComponent);
    await waitFor(() => expect(autocompleter.typeahead?.observed).toBe(true));
    fireEvent.input(input, { target: { value: 'Existing card' } });
    const [request] = await waitFor(() => {
      expect(handleRawError).not.toHaveBeenCalled();
      const requests = http.match((req) => req.url.includes('/work_packages'));
      expect(requests).toHaveLength(1);
      return requests;
    });
    const params = new URL(request.request.url, location.origin).searchParams;
    expect(params.get('filters')).toBe(JSON.stringify([{ typeahead: { operator: '**', values: ['Existing card'] } }]));
    request.flush({
      _type: 'WorkPackageCollection',
      _links: { self: { href: '/api/v3/work_packages' } },
      _embedded: {
        elements: [{
          _type: 'WorkPackage',
          id: 12,
          subject: 'Existing card',
          _links: { self: { href: '/api/v3/work_packages/12' } },
        }],
      },
    });

    fireEvent.click(await screen.findByRole('option', { name: /Existing card/ }));
    expect(ensureLoaded).toHaveBeenCalledTimes(2);
    expect(ensureLoaded).toHaveBeenLastCalledWith(expect.objectContaining({ id: '12' }));
    expect(reference).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-expanded', 'true');

    schema.next(hal.createHalResourceOfClass(SchemaResource, { _links: { self: { href: '/api/v3/work_packages/schemas/1-1' } } }));
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
    expect(reference).toHaveBeenCalledWith(expect.objectContaining({ id: '12' }));
    expect(cancel).toHaveBeenCalledOnce();
    http.verify();
  });
});
