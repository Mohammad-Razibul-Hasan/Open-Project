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

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, Directive, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { ReplaySubject, Subject } from 'rxjs';
import { ApiV3Service } from 'core-app/core/apiv3/api-v3.service';
import { I18nService } from 'core-app/core/i18n/i18n.service';
import { PathHelperService } from 'core-app/core/path-helper/path-helper.service';
import { TurboRequestsService } from 'core-app/core/turbo/turbo-requests.service';
import { CurrentProjectService } from 'core-app/core/current-project/current-project.service';
import { CurrentUserService } from 'core-app/core/current-user/current-user.service';
import { SchemaCacheService } from 'core-app/core/schemas/schema-cache.service';
import { RelationResource } from 'core-app/features/hal/resources/relation-resource';
import { SchemaResource } from 'core-app/features/hal/resources/schema-resource';
import { WorkPackageResource } from 'core-app/features/hal/resources/work-package-resource';
import { HalEventsService } from 'core-app/features/hal/services/hal-events.service';
import { HalResourceService } from 'core-app/features/hal/services/hal-resource.service';
import { WorkPackageInlineCreateComponent } from 'core-app/features/work-packages/components/wp-inline-create/wp-inline-create.component';
import { WorkPackageInlineCreateService } from 'core-app/features/work-packages/components/wp-inline-create/wp-inline-create.service';
import { UrlParamsHelperService } from 'core-app/features/work-packages/components/wp-query/url-params-helper';
import { WorkPackageRelationsTabComponent } from 'core-app/features/work-packages/components/wp-single-view-tabs/relations-tab/relations-tab.component';
import { IsolatedQuerySpace } from 'core-app/features/work-packages/directives/query-space/isolated-query-space';
import { WorkPackageNotificationService } from 'core-app/features/work-packages/services/notifications/work-package-notification.service';
import { EditFieldControlsComponent } from 'core-app/shared/components/fields/edit/field-controls/edit-field-controls.component';
import { OpIconComponent } from 'core-app/shared/components/icon/icon.component';
import { IAPIFilter } from 'core-app/shared/components/autocompleter/op-autocompleter/typings';
import { WpRelationInlineAddExistingComponent } from './embedded/inline/add-existing/wp-relation-inline-add-existing.component';
import { WpRelationInlineCreateServiceInterface } from './embedded/wp-relation-inline-create.service.interface';
import { WorkPackageRelationRowComponent } from './wp-relation-row/wp-relation-row.component';
import { WorkPackageRelationsCreateComponent } from './wp-relations-create/wp-relations-create.component';
import { WorkPackageRelationsGroupComponent } from './wp-relations-group/wp-relations-group.component';
import { WorkPackageRelationsHierarchyComponent } from './wp-relations-hierarchy/wp-relations-hierarchy.directive';
import { WorkPackageRelationsService } from './wp-relations.service';
import { WorkPackageRelationsComponent } from './wp-relations.component';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'wp-relations-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<button type="button" (click)="change.emit(candidate)">Select work package</button>',
})
class AutocompleteStubComponent {
  readonly workPackage = input.required<WorkPackageResource>();
  readonly selectedRelationType = input<string>();
  readonly filterCandidatesFor = input<string>();
  readonly hiddenOverflowContainer = input.required<string>();
  readonly filters = input<IAPIFilter[]>();
  // eslint-disable-next-line @angular-eslint/no-output-native -- Matches the autocomplete contract.
  readonly change = output<WorkPackageResource>();
  // eslint-disable-next-line @angular-eslint/no-output-native -- Matches the autocomplete contract.
  readonly cancel = output<void>();

  candidate:WorkPackageResource;
}

@Directive({
  selector: '[opTooltip]',
  host: { '[attr.aria-label]': 'label()' },
})
class TooltipStubDirective {
  readonly label = input.required<string>();
}

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'edit-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
})
class EditFormStubComponent {
  readonly resource = input.required<WorkPackageResource>();
}

@Component({
  selector: 'op-editable-attribute-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class EditableAttributeStubComponent {
  readonly resource = input.required<WorkPackageResource>();
  readonly fieldName = input.required<string>();
}

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'wp-children-query',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p>Children of {{ workPackage().subject }}</p>',
})
class ChildrenQueryStubComponent {
  readonly workPackage = input.required<WorkPackageResource>();
  readonly addExistingChildEnabled = input.required<boolean>();
  readonly query = input.required<object>();
}

@Component({
  selector: 'op-content-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
})
class ContentLoaderStubComponent {}

function deferred<T>() {
  let resolve!:(value:T) => void;
  let reject!:(error:unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('work package relation interactions', () => {
  const notification = {
    showSave: vi.fn<(wp:WorkPackageResource) => void>(),
    handleRawError: vi.fn<(error:unknown, wp:WorkPackageResource) => void>(),
  };
  const relations = {
    addCommonRelation: vi.fn<WorkPackageRelationsService['addCommonRelation']>(),
    updateCounter: vi.fn<WorkPackageRelationsService['updateCounter']>(),
    updateRelation: vi.fn<WorkPackageRelationsService['updateRelation']>(),
    updateRelationType: vi.fn<WorkPackageRelationsService['updateRelationType']>(),
    removeRelation: vi.fn<WorkPackageRelationsService['removeRelation']>(),
  };
  const resetRow = vi.fn<WorkPackageInlineCreateComponent['resetRow']>();
  const refresh = vi.fn<() => Promise<WorkPackageResource>>();
  const updateWorkPackage = vi.fn<(wp:WorkPackageResource) => Promise<void>>();
  let hal:HalResourceService;
  let streams:Map<string, Subject<WorkPackageResource>>;
  let schemaChanges:ReplaySubject<SchemaResource>;
  let inlineCreate:Pick<WpRelationInlineCreateServiceInterface, 'referenceTarget'|'relationType'|'newInlineWorkPackageReferenced'|'add'>;

  beforeEach(() => {
    vi.resetAllMocks();
    streams = new Map();
    schemaChanges = new ReplaySubject(1);
    TestBed.configureTestingModule({
      declarations: [
        EditFieldControlsComponent, OpIconComponent, WorkPackageRelationRowComponent, WorkPackageRelationsCreateComponent,
        WorkPackageRelationsGroupComponent, WorkPackageRelationsHierarchyComponent, WorkPackageRelationsTabComponent,
        WpRelationInlineAddExistingComponent, WorkPackageRelationsComponent,
      ],
      imports: [
        NgClass, FormsModule, AutocompleteStubComponent, TooltipStubDirective, EditFormStubComponent, EditableAttributeStubComponent,
        ChildrenQueryStubComponent, ContentLoaderStubComponent,
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CurrentProjectService, useValue: {} },
        { provide: CurrentUserService, useValue: {} },
        {
          provide: ApiV3Service,
          useValue: {
            work_packages: {
              cache: { updateWorkPackage },
              id: (wp:WorkPackageResource|string) => ({
                requireAndStream: () => streams.get(typeof wp === 'string' ? wp : wp.id!),
                refresh,
              }),
            },
          },
        },
        {
          provide: SchemaCacheService,
          useValue: {
            getSchemaHref: () => '/api/v3/work_packages/schemas/1-1',
            requireAndStream: () => schemaChanges,
            of: () => ({ isMilestone: false }),
            proxied: () => ({ isMilestone: false }),
          },
        },
        { provide: PathHelperService, useValue: { staticBase: '', workPackagePath: () => '/work_packages', genericWorkPackagePath: () => '/work_packages' } },
        { provide: TurboRequestsService, useValue: {} },
        { provide: I18nService, useValue: { t: (key:string) => key } },
        { provide: WorkPackageRelationsService, useValue: relations },
        { provide: WorkPackageNotificationService, useValue: notification },
        { provide: WorkPackageInlineCreateComponent, useValue: { resetRow } },
        { provide: WorkPackageInlineCreateService, useFactory: () => inlineCreate },
        { provide: UrlParamsHelperService, useValue: {} },
        IsolatedQuerySpace,
      ],
    });
    hal = TestBed.inject(HalResourceService);
    hal.registerResource('WorkPackage', { cls: WorkPackageResource });
  });

  function workPackage(id:number, subject:string) {
    if (!streams.has(String(id))) {
      streams.set(String(id), new Subject());
    }
    return hal.createHalResource<WorkPackageResource>({
      _type: 'WorkPackage',
      subject,
      _links: {
        self: { href: `/api/v3/work_packages/${id}` },
        project: { href: '/api/v3/projects/1' },
        type: { href: '/api/v3/types/1', title: 'Task' },
      },
    });
  }

  function relation(from:WorkPackageResource, to:WorkPackageResource, description:string, { removable = true, id = 1 } = {}) {
    const href = `/api/v3/relations/${id}`;
    const record = hal.createHalResourceOfClass(RelationResource, {
      _type: 'Relation',
      type: 'relates',
      reverseType: 'relates',
      description,
      _links: {
        self: { href },
        ...(removable ? { delete: { href, method: 'delete' } } : {}),
      },
    });
    record.from = from;
    record.to = to;
    return record;
  }

  function selectWorkPackage(candidate:WorkPackageResource, autocomplete:AutocompleteStubComponent) {
    autocomplete.candidate = candidate;
    fireEvent.click(screen.getByRole('button', { name: 'Select work package' }));
  }

  it('focuses the group toggle after requesting a grouping change', async () => {
    const fixture = TestBed.createComponent(WorkPackageRelationsGroupComponent);
    const toggle = vi.fn();
    fixture.componentInstance.onToggleGroupBy.subscribe(toggle);
    fixture.componentRef.setInput('header', 'Task relations');
    fixture.componentRef.setInput('firstGroup', true);
    fixture.componentRef.setInput('groupByWorkPackageType', true);
    await fixture.whenStable();

    expect(screen.getByRole('heading', { name: 'Task relations' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'js.relation_buttons.group_by_relation_type' });
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledOnce();
    await waitFor(() => expect(button).toHaveFocus());
    fixture.componentRef.setInput('groupByWorkPackageType', false);
    expect(await screen.findByRole('button', { name: 'js.relation_buttons.group_by_wp_type' })).toBe(button);
  });

  it.each([true, false])('closes the relation create form after a settled request (success=%s)', async (success) => {
    const fixture = TestBed.createComponent(WorkPackageRelationsCreateComponent);
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    const { promise, resolve, reject } = deferred<RelationResource>();
    relations.addCommonRelation.mockReturnValue(promise);
    fixture.componentRef.setInput('workPackage', wp);
    await fixture.whenStable();

    fireEvent.click(screen.getByRole('button', { name: 'js.relation_buttons.add_new_relation' }));
    const relationTypes = await screen.findByRole('listbox');
    fireEvent.change(relationTypes, { target: { value: 'blocks' } });
    const autocomplete = fixture.debugElement.children[0].query(
      (node) => node.componentInstance instanceof AutocompleteStubComponent,
    ).componentInstance as AutocompleteStubComponent;
    selectWorkPackage(related, autocomplete);
    expect(relations.addCommonRelation).toHaveBeenCalledWith('1', 'blocks', '2');
    await fixture.whenStable();
    expect(relationTypes).toBeInTheDocument();

    const error = new Error('Creation failed');
    if (success) {
      resolve(relation(wp, related, ''));
    } else {
      reject(error);
    }

    expect(await screen.findByRole('button', { name: 'js.relation_buttons.add_new_relation' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(notification.showSave.mock.calls).toEqual(success ? [[wp]] : []);
    expect(relations.updateCounter.mock.calls).toEqual(success ? [[wp]] : []);
    expect(notification.handleRawError.mock.calls).toEqual(success ? [] : [[error, wp]]);
  });

  it('publishes a pending create against its original work package after replacement', async () => {
    const fixture = TestBed.createComponent(WorkPackageRelationsCreateComponent);
    const wp = workPackage(1, 'Current');
    const candidate = workPackage(2, 'Candidate');
    const replacement = workPackage(3, 'Replacement');
    const { promise, resolve } = deferred<RelationResource>();
    relations.addCommonRelation.mockReturnValue(promise);
    const push = vi.spyOn(TestBed.inject(HalEventsService), 'push');
    fixture.componentRef.setInput('workPackage', wp);
    await fixture.whenStable();

    fireEvent.click(screen.getByRole('button', { name: 'js.relation_buttons.add_new_relation' }));
    await screen.findByRole('listbox');
    const autocomplete = fixture.debugElement.query(
      (node) => node.componentInstance instanceof AutocompleteStubComponent,
    ).componentInstance as AutocompleteStubComponent;
    selectWorkPackage(candidate, autocomplete);
    fixture.componentRef.setInput('workPackage', replacement);
    await fixture.whenStable();

    resolve(relation(wp, candidate, ''));
    await waitFor(() => expect(push).toHaveBeenCalledWith(wp, expect.objectContaining({ relationType: 'relates' })));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it.each([true, false])('settles the add-existing autocomplete (success=%s)', async (success) => {
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    const { promise, resolve, reject } = deferred<unknown>();
    inlineCreate = {
      referenceTarget: wp,
      relationType: 'children',
      newInlineWorkPackageReferenced: new Subject<string>(),
      add: vi.fn<WpRelationInlineCreateServiceInterface['add']>().mockReturnValue(promise),
    };
    const fixture = TestBed.createComponent(WpRelationInlineAddExistingComponent);
    const referenced = vi.fn<(id:string) => void>();
    const referencedSubscription = inlineCreate.newInlineWorkPackageReferenced.subscribe(referenced);
    await fixture.whenStable();
    const autocomplete = fixture.debugElement.query(
      (node) => node.componentInstance instanceof AutocompleteStubComponent,
    ).componentInstance as AutocompleteStubComponent;
    expect(autocomplete.filterCandidatesFor()).toBe('children');
    expect(screen.getByRole('button', { name: 'js.relation_buttons.abort' })).toBeInTheDocument();
    selectWorkPackage(related, autocomplete);
    expect(inlineCreate.add).toHaveBeenCalledWith(wp, '2');

    const error = new Error('Association failed');
    if (success) {
      resolve(undefined);
    } else {
      reject(error);
    }

    await waitFor(() => expect(resetRow).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledTimes(success ? 1 : 0);
    expect(referenced.mock.calls).toEqual(success ? [['2']] : []);
    expect(notification.handleRawError.mock.calls).toEqual(success ? [] : [[error, wp]]);
    referencedSubscription.unsubscribe();
  });

  it('does not publish a late inline reference or reset a replacement row', async () => {
    const wp = workPackage(1, 'Current');
    const candidate = workPackage(2, 'Candidate');
    const replacement = workPackage(3, 'Replacement');
    const { promise, resolve } = deferred<Awaited<ReturnType<WpRelationInlineCreateServiceInterface['add']>>>();
    inlineCreate = {
      referenceTarget: wp,
      relationType: 'children',
      newInlineWorkPackageReferenced: new Subject(),
      add: vi.fn<WpRelationInlineCreateServiceInterface['add']>().mockReturnValue(promise),
    };
    const push = vi.spyOn(TestBed.inject(HalEventsService), 'push');
    const fixture = TestBed.createComponent(WpRelationInlineAddExistingComponent);
    await fixture.whenStable();
    const autocomplete = fixture.debugElement.query(
      (node) => node.componentInstance instanceof AutocompleteStubComponent,
    ).componentInstance as AutocompleteStubComponent;

    const referenced = vi.fn<typeof inlineCreate.newInlineWorkPackageReferenced.next>();
    const subscription = inlineCreate.newInlineWorkPackageReferenced.subscribe(referenced);
    try {
      selectWorkPackage(candidate, autocomplete);
      expect(inlineCreate.add).toHaveBeenCalledExactlyOnceWith(wp, '2');
      fixture.destroy();
      inlineCreate.referenceTarget = replacement;
      resolve(undefined);

      // The next browser task runs after the request's then, catch and finally microtasks.
      await new Promise<void>((settled) => setTimeout(settled));
      expect(push).toHaveBeenCalledExactlyOnceWith(wp, expect.objectContaining({
        eventType: 'association', relatedWorkPackage: '2', relationType: 'children',
      }));
      expect(referenced).not.toHaveBeenCalled();
      expect(resetRow).not.toHaveBeenCalled();
    } finally {
      subscription.unsubscribe();
    }
  });

  it('saves a relation description in place and removes the relation', async () => {
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    related.relatedBy = relation(wp, related, 'Original description');
    const { promise, resolve } = deferred<RelationResource>();
    relations.updateRelation.mockReturnValue(promise);
    relations.removeRelation.mockResolvedValue(undefined);
    const fixture = TestBed.createComponent(WorkPackageRelationRowComponent);
    fixture.componentRef.setInput('workPackage', wp);
    fixture.componentRef.setInput('relatedWorkPackage', related);
    fixture.componentRef.setInput('groupByWorkPackageType', true);
    await fixture.whenStable();

    expect(screen.getByRole('link', { name: /Related/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'js.relation_buttons.toggle_description' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Original description' }));
    const description = await screen.findByRole('textbox');
    await waitFor(() => expect(description).toHaveFocus());
    fireEvent.input(description, { target: { value: 'Updated description' } });
    fireEvent.click(screen.getByRole('button', { name: 'js.button_save' }));
    expect(relations.updateRelation).toHaveBeenCalledWith(related.relatedBy, { description: 'Updated description' });
    await fixture.whenStable();
    expect(description).toBeInTheDocument();

    const saved = relation(wp, related, 'Updated description');
    resolve(saved);
    expect(await screen.findByRole('button', { name: 'Updated description' })).toBeInTheDocument();
    expect(related.relatedBy).toBe(saved);

    fireEvent.click(screen.getByRole('button', { name: 'js.relation_buttons.remove' }));
    await waitFor(() => expect(updateWorkPackage).toHaveBeenCalledWith(related));
    expect(relations.removeRelation).toHaveBeenCalledWith(saved);
    expect(relations.updateCounter).toHaveBeenCalledWith(wp);
  });

  it.each([2, 3])('resets editors and keeps a pending save on the original relation when replaced by a relation to work package %i', async (replacementId) => {
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    const replacement = workPackage(replacementId, 'Replacement');
    related.relatedBy = relation(wp, related, 'Original description');
    const replacementRelation = relation(wp, replacement, 'Replacement description', { id: 2 });
    replacement.relatedBy = replacementRelation;
    const { promise, resolve } = deferred<RelationResource>();
    relations.updateRelation.mockReturnValue(promise);
    const fixture = TestBed.createComponent(WorkPackageRelationRowComponent);
    fixture.componentRef.setInput('workPackage', wp);
    fixture.componentRef.setInput('relatedWorkPackage', related);
    fixture.componentRef.setInput('groupByWorkPackageType', true);
    await fixture.whenStable();

    fireEvent.click(screen.getByRole('button', { name: 'js.relation_buttons.toggle_description' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Original description' }));
    fireEvent.click(await screen.findByRole('button', { name: 'js.button_save' }));
    fireEvent.click(screen.getByRole('button', { name: /js.relation_labels.relates/ }));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    fixture.componentRef.setInput('relatedWorkPackage', replacement);
    expect(await screen.findByRole('button', { name: 'Replacement description' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    const saved = relation(wp, related, 'Saved description');
    resolve(saved);
    await promise;
    await fixture.whenStable();
    expect(replacement.relatedBy).toBe(replacementRelation);
    expect(related.relatedBy).toBe(saved);
    expect(screen.getByRole('button', { name: 'Replacement description' })).toBeInTheDocument();
  });

  it('preserves a description draft when the related work package refreshes', async () => {
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    related.relatedBy = relation(wp, related, 'Original description');
    const fixture = TestBed.createComponent(WorkPackageRelationRowComponent);
    fixture.componentRef.setInput('workPackage', wp);
    fixture.componentRef.setInput('relatedWorkPackage', related);
    fixture.componentRef.setInput('groupByWorkPackageType', true);
    await fixture.whenStable();

    fireEvent.click(screen.getByRole('button', { name: 'js.relation_buttons.toggle_description' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Original description' }));
    const description = await screen.findByRole('textbox');
    fireEvent.input(description, { target: { value: 'Unsaved draft' } });
    await fixture.whenStable();

    const refreshed = workPackage(2, 'Refreshed subject');
    refreshed.relatedBy = relation(wp, refreshed, 'Refreshed description');
    expect(refreshed).not.toBe(related);
    expect(refreshed.id).toBe('2');
    expect(refreshed.relatedBy).not.toBe(related.relatedBy);
    expect(refreshed.relatedBy.href).toBe(related.relatedBy.href);
    fixture.componentRef.setInput('relatedWorkPackage', refreshed);

    expect(await screen.findByRole('link', { name: /Refreshed subject/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBe(description);
    expect(description).toHaveValue('Unsaved draft');

    fireEvent.click(screen.getByRole('button', { name: 'js.button_cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refreshed description' }));
    expect(await screen.findByRole('textbox')).toHaveValue('Refreshed description');
  });

  it('preserves the type editor when the owning work package refreshes', async () => {
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    const original = relation(wp, related, '');
    related.relatedBy = original;
    const { promise, resolve } = deferred<RelationResource>();
    relations.updateRelationType.mockReturnValue(promise);
    const fixture = TestBed.createComponent(WorkPackageRelationRowComponent);
    fixture.componentRef.setInput('workPackage', wp);
    fixture.componentRef.setInput('relatedWorkPackage', related);
    fixture.componentRef.setInput('groupByWorkPackageType', true);
    await fixture.whenStable();

    fireEvent.click(screen.getByRole('button', { name: /js.relation_labels.relates/ }));
    const listbox = await screen.findByRole('listbox');
    const blocks = within(listbox).getByRole<HTMLOptionElement>('option', { name: /blocks/i });
    fireEvent.change(listbox, { target: { value: blocks.value } });
    expect(relations.updateRelationType).toHaveBeenCalledExactlyOnceWith(wp, related, original, 'blocks');
    await fixture.whenStable();
    expect(listbox).toHaveValue(blocks.value);

    const refreshed = workPackage(1, 'Refreshed owner');
    expect(refreshed).not.toBe(wp);
    expect(refreshed.id).toBe('1');
    fixture.componentRef.setInput('workPackage', refreshed);
    await fixture.whenStable();

    expect(screen.getByRole('listbox')).toBe(listbox);
    expect(listbox).toHaveValue(blocks.value);

    const saved = relation(refreshed, related, '');
    saved.type = 'blocks';
    resolve(saved);
    expect(await screen.findByRole('button', { name: /js.relation_labels.blocks/ })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('renders a saved relation type after the request settles', async () => {
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    related.relatedBy = relation(wp, related, '');
    const { promise, resolve } = deferred<RelationResource>();
    relations.updateRelationType.mockReturnValue(promise);
    const fixture = TestBed.createComponent(WorkPackageRelationRowComponent);
    fixture.componentRef.setInput('workPackage', wp);
    fixture.componentRef.setInput('relatedWorkPackage', related);
    fixture.componentRef.setInput('groupByWorkPackageType', true);
    await fixture.whenStable();

    fireEvent.click(screen.getByRole('button', { name: /js.relation_labels.relates/ }));
    const listbox = await screen.findByRole('listbox');
    const blocks = within(listbox).getByRole<HTMLOptionElement>('option', { name: /blocks/i });
    fireEvent.change(listbox, { target: { value: blocks.value } });
    await fixture.whenStable();
    expect(relations.updateRelationType).toHaveBeenCalledWith(wp, related, related.relatedBy, 'blocks');

    const saved = relation(wp, related, '');
    saved.type = 'blocks';
    resolve(saved);
    expect(await screen.findByRole('button', { name: /js.relation_labels.blocks/ })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('renders both successful overlapping saves to the same logical relation', async () => {
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    const original = relation(wp, related, 'Original description');
    related.relatedBy = original;
    const descriptionSave = deferred<RelationResource>();
    const typeSave = deferred<RelationResource>();
    relations.updateRelation.mockReturnValue(descriptionSave.promise);
    relations.updateRelationType.mockReturnValue(typeSave.promise);
    const fixture = TestBed.createComponent(WorkPackageRelationRowComponent);
    fixture.componentRef.setInput('workPackage', wp);
    fixture.componentRef.setInput('relatedWorkPackage', related);
    fixture.componentRef.setInput('groupByWorkPackageType', true);
    await fixture.whenStable();

    fireEvent.click(screen.getByRole('button', { name: 'js.relation_buttons.toggle_description' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Original description' }));
    fireEvent.input(await screen.findByRole('textbox'), { target: { value: 'Updated description' } });
    fireEvent.click(screen.getByRole('button', { name: 'js.button_save' }));
    fireEvent.click(screen.getByRole('button', { name: /js.relation_labels.relates/ }));
    const listbox = await screen.findByRole('listbox');
    const blocks = within(listbox).getByRole<HTMLOptionElement>('option', { name: /blocks/i });
    fireEvent.change(listbox, { target: { value: blocks.value } });
    await fixture.whenStable();
    expect(relations.updateRelation).toHaveBeenCalledExactlyOnceWith(original, { description: 'Updated description' });
    expect(relations.updateRelationType).toHaveBeenCalledExactlyOnceWith(wp, related, original, 'blocks');

    const withDescription = relation(wp, related, 'Updated description');
    descriptionSave.resolve(withDescription);
    expect(await screen.findByRole('button', { name: 'Updated description' })).toBeInTheDocument();
    expect(related.relatedBy).toBe(withDescription);

    const withBothChanges = relation(wp, related, 'Updated description');
    withBothChanges.type = 'blocks';
    typeSave.resolve(withBothChanges);
    expect(await screen.findByRole('button', { name: /js.relation_labels.blocks/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Updated description' })).toBeInTheDocument();
    expect(related.relatedBy).toBe(withBothChanges);
  });

  it('renders same-object row publications and replaces the relation and its owned subscription', async () => {
    const wp = workPackage(1, 'Current');
    const related = workPackage(2, 'Related');
    related.relatedBy = relation(wp, related, 'Original description');
    const fixture = TestBed.createComponent(WorkPackageRelationRowComponent);
    fixture.componentRef.setInput('workPackage', wp);
    fixture.componentRef.setInput('relatedWorkPackage', related);
    fixture.componentRef.setInput('groupByWorkPackageType', true);
    await fixture.whenStable();

    related.subject = 'Published subject';
    const previous = streams.get('2')!;
    previous.next(related);
    expect(await screen.findByRole('link', { name: /Published subject/ })).toBeInTheDocument();

    const replacement = workPackage(3, 'Replacement');
    replacement.relatedBy = relation(wp, replacement, 'Replacement description', { id: 2, removable: false });
    fixture.componentRef.setInput('relatedWorkPackage', replacement);
    expect(await screen.findByRole('link', { name: /Replacement/ })).toBeInTheDocument();
    expect(previous.observed).toBe(false);
    expect(screen.queryByRole('button', { name: 'js.relation_buttons.remove' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'js.relation_buttons.toggle_description' }));
    expect(await screen.findByRole('button', { name: 'Replacement description' })).toBeInTheDocument();

    fixture.destroy();
    expect(streams.get('3')!.observed).toBe(false);
  });

  it('shows the hierarchy for the current resource once its schema is available and tears down its streams', async () => {
    const wp = workPackage(1, 'Current');
    const fixture = TestBed.createComponent(WorkPackageRelationsHierarchyComponent);
    fixture.componentRef.setInput('workPackage', wp);
    await fixture.whenStable();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    const stream = streams.get('1')!;
    stream.next(wp);
    schemaChanges.next(hal.createHalResourceOfClass(SchemaResource, {}));
    expect(await screen.findByRole('heading', { name: 'js.relations_hierarchy.children_headline' })).toBeInTheDocument();
    expect(screen.getByText('Children of Current')).toBeInTheDocument();

    const replacement = workPackage(2, 'Replacement');
    fixture.componentRef.setInput('workPackage', replacement);
    await fixture.whenStable();
    expect(stream.observed).toBe(false);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    const replacementStream = streams.get('2')!;
    replacementStream.next(replacement);
    expect(await screen.findByText('Children of Replacement')).toBeInTheDocument();

    fixture.destroy();
    expect(replacementStream.observed).toBe(false);
    expect(schemaChanges.observed).toBe(false);
  });

  it('forwards the replacement work package to the relations tab and tears down both subscriptions', async () => {
    const first = workPackage(1, 'Current');
    const second = workPackage(2, 'Replacement');
    const fetchController = new AbortController();
    document.addEventListener('turbo:before-fetch-request', (event) => event.preventDefault(), { signal: fetchController.signal });
    const fixture = TestBed.createComponent(WorkPackageRelationsTabComponent);
    fixture.componentRef.onDestroy(() => fetchController.abort());
    const frame = () => (fixture.nativeElement as HTMLElement).querySelector('turbo-frame');
    fixture.componentRef.setInput('workPackage', first);
    await fixture.whenStable();
    const originalFrame = frame();
    expect(originalFrame).toHaveAttribute('src', '/work_packages/1/relations_tab');

    fixture.componentRef.setInput('workPackage', second);
    await fixture.whenStable();
    const replacementFrame = frame();
    expect(replacementFrame).toHaveAttribute('src', '/work_packages/2/relations_tab');
    expect(replacementFrame).not.toBe(originalFrame);
    expect(streams.get('1')!.observed).toBe(false);

    const updated = hal.createHalResource<WorkPackageResource>({ ...second.$source, subject: 'Loaded replacement' });
    const current = streams.get('2')!;
    current.next(updated);
    await fixture.whenStable();
    expect(fixture.componentInstance.workPackage).toBe(updated);
    expect(frame()).toBe(replacementFrame);

    fixture.destroy();
    expect(current.observed).toBe(false);
  });
});
